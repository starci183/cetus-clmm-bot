import { Injectable, Logger } from "@nestjs/common"
import { CetusActionService } from "./action.service"
import { OnEvent } from "@nestjs/event-emitter"
import { CetusEvent } from "./events"
import { PoolWithPosition } from "./types"
import { MemDbService, PairSchema, TokenSchema } from "../databases"
import { TickManagerService } from "./tick-manager.service"
import { CetusSwapService } from "./swap.service"
import { RetryService } from "@/modules/mixin"
import { CetusTxRateLimiterService } from "./cetus-rate-limiter.service"
import { CetusTWAPService } from "./twap.service"

@Injectable()
export class CetusCoreService {
    private readonly logger = new Logger(CetusCoreService.name)
    constructor(
        private readonly cetusActionService: CetusActionService,
        private readonly memdbService: MemDbService,
        private readonly tickManagerService: TickManagerService,
        private readonly cetusSwapService: CetusSwapService,
        private readonly retryService: RetryService,
        private readonly cetusTxRateLimiterService: CetusTxRateLimiterService,
        private readonly cetusTWAPService: CetusTWAPService,
    ) { }

    @OnEvent(CetusEvent.PoolsUpdated)
    async handlePoolsUpdated(data: Partial<Record<string, PoolWithPosition>>) {
        if (await this.cetusTxRateLimiterService.isRateLimitExceeded()) {
            this.logger.error("Rate limit exceeded")
            return
        }
        for (const profilePairId of Object.keys(data)) {
            const poolWithPosition = data[profilePairId]
            if (!poolWithPosition) {
                throw new Error(`Pool with position ${profilePairId} not found`)
            }

            const { pool, position, profilePair } = poolWithPosition
            const pair = profilePair.pair as PairSchema  
            const tokenA = pair.tokenA as TokenSchema
            const tokenB = pair.tokenB as TokenSchema
            // create tick
            await this.cetusTWAPService.addTick(pair.displayId, pool.current_tick_index)
            // check volatility
            const { delta } = await this.cetusTWAPService.checkVolatility({
                pairId: pair.displayId,
                tickSpacing: this.tickManagerService.tickSpacing(pool),
            })
            this.logger.debug(`[${pair.displayId}] TWAP delta: ${delta}`)

            const priorityAOverB = this.memdbService.priorityAOverB(profilePair)
            //// LOG
            this.logger.fatal(
                `[${pair.displayId}] A over B: ${priorityAOverB}`,
            )
            this.logger.fatal(
                `[${pair.displayId}] Current tick: ${pool.current_tick_index}`,
            )
            const [tickLower, tickUpper] = this.tickManagerService.tickBounds(pool)
            this.logger.fatal(
                `[${pair.displayId}] Distance from bounds: Left: ${Math.abs(tickLower - pool.current_tick_index)}, Right: ${Math.abs(pool.current_tick_index - tickUpper)}`,
            )

            /// No position -> try add liquidity
            if (!position) {
                await this.retryService.retry({
                    action: async () => {
                        await this.cetusActionService.addLiquidityFixToken(pool, profilePair)
                    },
                })
                continue
            }
            /// We check volatility here if it's volatile, we will not move position
            const { direction } = await this.cetusTWAPService.checkVolatility({
                pairId: pair.displayId,
                tickSpacing: this.tickManagerService.tickSpacing(pool),
            })
            // Currently on reverse trend
            if (direction) {
                // we love ika and price ika up => all asset will convert to sui
                if (
                    priorityAOverB && direction === "up" 
                    || 
                    !priorityAOverB && direction === "down"
                ) {
                    this.logger.verbose(`[${pair.displayId}] Currently on reverse trend, 
                        have to remove position...`)
                    await this.processTransactions(poolWithPosition)
                    continue
                }
            }
            /// Already has a position
            const { isOutOfRange, tickDistance, leftOverRight } =
                this.tickManagerService.computePositionRange(pool, position)
            if (!isOutOfRange) {
                this.logger.log(`[${pair.displayId}] Position is in range, earning fees...`)
                continue
            }
            // Determine the direction of the swap
            const convertedToken = leftOverRight ? tokenA : tokenB
            const oppositeToken = leftOverRight ? tokenB : tokenA
            this.logger.error(
                `[${pair.displayId}] Out of range, all your assets are converted to ${convertedToken.name}. Distance: ${tickDistance}`,
            )
            if (
                // left over right
                leftOverRight === priorityAOverB
            ) {
                this.logger.verbose(
                    `[${pair.displayId}] You prefer ${convertedToken.name}, no swap needed, just rearrange if possible`,
                )
                const canMove = this.tickManagerService.canMovePosition(
                    pool,
                    position,
                    profilePair,
                )
                if (!canMove) {
                    this.logger.verbose(`[${pair.displayId}] You cannot move position, skipping...`)
                    continue
                }
                await this.processTransactions(poolWithPosition)
            } else { 
                this.logger.verbose(
                    `[${pair.displayId}] You actually want ${oppositeToken.name}, must swap to avoid slippage`,
                )
                await this.processTransactions(poolWithPosition)
            }
        }
    }

    private async processTransactions(
        poolWithPosition: PoolWithPosition,
    ) {
        const { pool, profilePair } = poolWithPosition
        const pair = profilePair.pair as PairSchema

        const priorityAOverB = this.memdbService.priorityAOverB(profilePair)
        try {
            // 1️⃣ Close position
            await this.retryService.retry({
                action: async () => {
                    await this.cetusActionService.closePosition(poolWithPosition)
                }
            })
            
            // 2️⃣ Swap token
            await this.retryService.retry({
                action: async () => {
                    await this.cetusSwapService.swap({
                        profilePair,
                        a2b: !priorityAOverB,
                    })
                }
            })
            
            // 3️⃣ Add liquidity
            await this.retryService.retry({
                action: async () => {
                    await this.cetusActionService.addLiquidityFixToken(pool, profilePair)
                }
            })
        } catch (error) {
            this.logger.error(
                `[${pair.displayId}] Error swapping: ${error.message}`,
            )
        }
    }
}

