import { Injectable, Logger } from "@nestjs/common"
import { CetusActionService } from "./action.service"
import { OnEvent } from "@nestjs/event-emitter"
import { CetusEvent } from "./events"
import { PoolWithPosition } from "./types"
import { MemDbService, PairSchema, TokenSchema } from "../databases"
import { TickManagerService } from "./tick-manager.service"
import { CetusSwapService } from "./swap.service"
import { RetryService } from "@/modules/mixin"

@Injectable()
export class CetusCoreService {
    private readonly logger = new Logger(CetusCoreService.name)
    constructor(
        private readonly cetusActionService: CetusActionService,
        private readonly memdbService: MemDbService,
        private readonly tickManagerService: TickManagerService,
        private readonly cetusSwapService: CetusSwapService,
        private readonly retryService: RetryService
    ) { }

    @OnEvent(CetusEvent.PoolsUpdated)
    async handlePoolsUpdated(data: Partial<Record<string, PoolWithPosition>>) {
        for (const profilePairId of Object.keys(data)) {
            const poolWithPosition = data[profilePairId]
            if (!poolWithPosition) {
                throw new Error(`Pool with position ${profilePairId} not found`)
            }
    
            const { pool, position, profilePair } = poolWithPosition
            const pair = profilePair.pair as PairSchema
            const tokenA = pair.tokenA as TokenSchema
            const tokenB = pair.tokenB as TokenSchema
    
            const priorityAOverB = this.memdbService.priorityAOverB(profilePair)
    
            //// LOG
            this.logger.fatal(`Current tick: ${pool.current_tick_index}`)
            const [tickLower, tickUpper] = this.tickManagerService.tickBounds(pool)
            this.logger.fatal(`Distance from bounds: Left: ${Math.abs(tickLower - pool.current_tick_index)}, Right: ${Math.abs(pool.current_tick_index - tickUpper)}`)
            ////    

            /// No position -> try add liquidity
            if (!position) {
                await this.retryService.retry({
                    action: async () => {
                        await this.cetusActionService.addLiquidityFixToken(pool, profilePair)
                    },
                })
                continue
            }
    
            /// Already has a position
            const { isOutOfRange, tickDistance, leftOverRight } = this.tickManagerService.computePositionRange(pool, position)
            if (!isOutOfRange) {
                this.logger.verbose("Position is in range, earning fees...")
                continue
            }
            // Determine the direction of the swap
            const convertedToken = leftOverRight ? tokenA : tokenB
            const oppositeToken = leftOverRight ? tokenB : tokenA
            this.logger.verbose(`All your assets are converted to ${convertedToken.name}`)
            if (
                // left over right
                leftOverRight === priorityAOverB
            ) {
                this.logger.verbose(`You prefer ${convertedToken.name}, no swap needed, just rearrange if possible`)
                const canMove = this.tickManagerService.canMovePosition(pool, position, profilePair)
                if (!canMove) {
                    this.logger.verbose("You cannot move position, skipping...")
                    continue
                }
                await this.retryService.retry({
                    action: async () => {
                        await this.cetusActionService.closePosition(poolWithPosition)
                    },
                })
                await this.retryService.retry({
                    action: async () => {
                        await this.cetusActionService.addLiquidityFixToken(pool, profilePair)
                    },
                })
            } else {
                this.logger.verbose(`You actually want ${oppositeToken.name}, must swap to avoid slippage`)
                if (tickDistance < this.tickManagerService.computeAllowedTickDeviation(pool)) {
                    this.logger.debug(`Tick distance ${tickDistance} within deviation, keeping...`)
                    continue
                }
                await this.retryService.retry({
                    action: async () => {
                        await this.cetusActionService.closePosition(poolWithPosition)
                    },
                })
                await this.retryService.retry({
                    action: async () => {
                        await this.cetusSwapService.swap({ profilePair, a2b: !priorityAOverB })
                    },
                    maxRetries: 10,
                })
                await this.retryService.retry({
                    action: async () => {
                        await this.cetusActionService.addLiquidityFixToken(pool, profilePair)
                    },
                })
            }
        }
    }
}