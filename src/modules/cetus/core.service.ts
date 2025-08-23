import { Injectable, Logger } from "@nestjs/common"
import { CetusActionService } from "./action.service"
import { OnEvent } from "@nestjs/event-emitter"
import { CetusEvent } from "./events"
import { PoolWithPosition } from "./types"
import { MemDbService, PairSchema, TokenSchema } from "../databases"
import { TickManagerService } from "./tick-manager.service"
import { CetusSwapService } from "./swap.service"

@Injectable()
export class CetusCoreService {
    private readonly logger = new Logger(CetusCoreService.name)
    constructor(
        private readonly cetusActionService: CetusActionService,
        private readonly memdbService: MemDbService,
        private readonly tickManagerService: TickManagerService,
        private readonly cetusSwapService: CetusSwapService
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
            this.logger.fatal(`Distance from: Left: ${Math.abs(tickLower - pool.current_tick_index)}, Right: ${Math.abs(pool.current_tick_index - tickUpper)}`)
            ////
    
            /// No position -> try add liquidity
            if (!position) {
                const success = await this.cetusActionService.addLiquidityFixToken(pool, profilePair)
                if (!success) return
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
            const swapDirection = leftOverRight ? false : true // false = B→A, true = A→B
    
            this.logger.verbose(`All your assets are converted to ${convertedToken.name}`)
    
            const priorityMatch = (priorityAOverB && leftOverRight) || (!priorityAOverB && !leftOverRight)
    
            if (priorityMatch) {
                this.logger.verbose(`You prefer ${convertedToken.name}, no swap needed, just rearrange if possible`)
                const canMove = this.tickManagerService.canMovePosition(pool, position, profilePair)
                if (!canMove) {
                    this.logger.verbose("You cannot move position, skipping...")
                    continue
                }
                await this.cetusActionService.closePosition(poolWithPosition)
                await this.cetusActionService.addLiquidityFixToken(pool, profilePair)
            } else {
                this.logger.verbose(`You actually want ${oppositeToken.name}, must swap to avoid slippage`)
                if (tickDistance < this.tickManagerService.computeAllowedTickDeviation(pool)) {
                    this.logger.debug(`Tick distance ${tickDistance} within deviation, keeping...`)
                    continue
                }
                await this.cetusActionService.closePosition(poolWithPosition)
                await this.cetusSwapService.swap({ profilePair, a2b: swapDirection })
                await this.cetusActionService.addLiquidityFixToken(pool, profilePair)
            }
        }
    }
}