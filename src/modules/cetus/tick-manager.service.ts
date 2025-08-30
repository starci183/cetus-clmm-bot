import { Injectable, Logger } from "@nestjs/common"
import { Pool, Position } from "@cetusprotocol/cetus-sui-clmm-sdk"
import { ProfilePairSchema } from "@/modules/databases"
import { MemDbService } from "@/modules/databases"

const TICK_DEVIATION_THRESHOLD = 1/10

@Injectable()
export class TickManagerService {
    private readonly logger = new Logger(TickManagerService.name)
    constructor(
        private readonly memdbService: MemDbService,
    ) { }

    public tickSpacing(pool: Pool) {
        return Number.parseInt(pool.tickSpacing)
    }

    public currentTick(pool: Pool) {
        return pool.current_tick_index
    }

    public tickBounds(pool: Pool) {
        const tickSpacing = this.tickSpacing(pool)
        const currentTick = this.currentTick(pool)
        const lowerTick = Math.floor((currentTick) / tickSpacing) * tickSpacing
        return [
            lowerTick,
            lowerTick + tickSpacing
        ]
    }

    public tickDistanceBetweenPriorityBound(
        pool: Pool,
        priorityAOverB: boolean
    ) {
        const currentTick = this.currentTick(pool)
        const [lowerTick, upperTick] = this.tickBounds(pool)
        return priorityAOverB ? Math.abs(upperTick - currentTick) : Math.abs(lowerTick - currentTick)
    }

    public computeAllowedTickDeviation(
        pool: Pool
    ) {
        const tickSpacing = this.tickSpacing(pool)
        return Math.min(Math.floor(tickSpacing * TICK_DEVIATION_THRESHOLD), 4)
    }

    public canAddLiquidity(
        pool: Pool,
        profilePair: ProfilePairSchema
    ) {
        const priorityAOverB = this.memdbService.priorityAOverB(profilePair)
        const tickDistance = this.tickDistanceBetweenPriorityBound(pool, priorityAOverB)
        const tickMaxDeviation = this.computeAllowedTickDeviation(pool)
        return tickDistance <= tickMaxDeviation
    }

    public computePositionRange(
        pool: Pool,
        position: Position,
    ): PositionOutOfRangeResponse {
        const [positionTickUpper, positionTickLower] = [position.tick_upper_index, position.tick_lower_index]
        const currentTick = this.currentTick(pool)
        // the position still in the range, keep earning fees
        if (positionTickUpper >= currentTick && positionTickLower <= currentTick) {
            return {
                isOutOfRange: false,
                tickDistance: 0,
            }
        }
        if (positionTickUpper < currentTick) {
            return {
                isOutOfRange: true,
                tickDistance: Math.abs(positionTickUpper - currentTick),
                leftOverRight: false,
            }
        } else {
            return {
                isOutOfRange: true,
                tickDistance: Math.abs(currentTick - positionTickLower),
                leftOverRight: true,
            }
        }
    } 

    public canMovePosition(
        pool: Pool,
        position: Position,
        profilePair: ProfilePairSchema
    ) {
        const priorityAOverB = this.memdbService.priorityAOverB(profilePair)
        const tickSpacing = this.tickSpacing(pool)
        const canAddLiquidity = this.canAddLiquidity(pool, profilePair)
        if (priorityAOverB) {
            return canAddLiquidity && ((Math.abs(position.tick_lower_index - pool.current_tick_index) > tickSpacing))
        } else {
            return canAddLiquidity && ((Math.abs(position.tick_upper_index - pool.current_tick_index) > tickSpacing))
        }
    }
}

export interface PositionOutOfRangeResponse {
    isOutOfRange: boolean
    tickDistance: number
    leftOverRight?: boolean
}