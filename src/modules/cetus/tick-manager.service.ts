import { Injectable, Logger } from "@nestjs/common"
import { Cache } from "cache-manager"
import { InjectCache } from "../cache"
import { PoolWithFetchedPositions } from "./types"
import { MixinService } from "./mixin.service"
import { tokens } from "./tokens"
import { Pool, TickMath } from "@cetusprotocol/cetus-sui-clmm-sdk"
import { Cron } from "@nestjs/schedule"

const CACHE_TICK_NAME = "CURRENT_TICK"
const NOT_DEVIATED_TIMES_CACHE_NAME = "NOT_DEVIATED_TIMES"
const CACHE_TICK_TTL = 1000 * 60 * 60 * 24 * 3 // 3 days
const VIOLATE_STOP = 0.01 // 1%
const NOT_DEVIATED_TIMES = 12 * 60 // 1 hours, since each 5s we check the tick

@Injectable()
export class TickManagerService {
    private readonly logger = new Logger(TickManagerService.name)
    constructor(
        @InjectCache()
        private readonly cacheManager: Cache,
        private readonly mixinService: MixinService,
    ) { }

    // 3 days cooling period
    @Cron("0 0 */3 * *")
    public async resetCurrentTick() {
        await this.resetCachedCurrentTick()
    }

    public async cacheCurrentTick(currentTick: number) {
        await this.cacheManager.set(CACHE_TICK_NAME, currentTick, CACHE_TICK_TTL)
    }

    public async getCachedCurrentTick() {
        return await this.cacheManager.get<number>(CACHE_TICK_NAME)
    }

    public async incrementNotDeviatedTimes() {
        const notDeviatedTimes = await this.cacheManager.get<number>(NOT_DEVIATED_TIMES_CACHE_NAME) || 0
        const newNotDeviatedTimes = notDeviatedTimes + 1
        await this.cacheManager.set(NOT_DEVIATED_TIMES_CACHE_NAME, newNotDeviatedTimes, 0)
        return newNotDeviatedTimes
    }

    public async resetCachedNotDeviatedTimes() {
        await this.cacheManager.del(NOT_DEVIATED_TIMES_CACHE_NAME)
    }

    public async resetCachedCurrentTick() {
        await this.cacheManager.del(CACHE_TICK_NAME)
    }

    public computeTickBoundaries(
        poolWithFetchedPositions: PoolWithFetchedPositions,
        currentTick: number,
    ) {
        const { pool } = poolWithFetchedPositions
        const [token0, token1] = [pool.coinTypeA, pool.coinTypeB].map(
            (coinType) =>
                Object.values(tokens).find((token) =>
                    this.mixinService.checkTokenAddress(token.address, coinType),
                )!,
        )
        const priceAtCurrentTick = TickMath.tickIndexToPrice(
            currentTick,
            token0.decimals,
            token1.decimals,
        )
        const [lowerPrice, upperPrice] = [
            priceAtCurrentTick.mul(1 - VIOLATE_STOP),
            priceAtCurrentTick.mul(1 + VIOLATE_STOP),
        ]
        const [lowerTick, upperTick] = [
            TickMath.priceToTickIndex(lowerPrice, token0.decimals, token1.decimals),
            TickMath.priceToTickIndex(upperPrice, token0.decimals, token1.decimals),
        ]
        return {
            lowerTick,
            upperTick,
        }
    }

    public async getOrCacheCurrentTick(
        poolWithFetchedPositions: PoolWithFetchedPositions,
    ) {
        let currentTick = await this.getCachedCurrentTick()
        if (!currentTick) {
            await this.cacheCurrentTick(
                poolWithFetchedPositions.pool.current_tick_index,
            )
            currentTick = poolWithFetchedPositions.pool.current_tick_index
        }
        return currentTick
    }

    public async hasTickDeviated(
        poolWithFetchedPositions: PoolWithFetchedPositions,
        currentTick: number,
    ) {
        const { lowerTick, upperTick } = this.computeTickBoundaries(
            poolWithFetchedPositions,
            currentTick,
        )
        return currentTick <= lowerTick || currentTick >= upperTick
    }

    public async resetCurrentTickIfNotDeviated(
        poolWithFetchedPositions: PoolWithFetchedPositions,
        currentTick: number,
    ) {
        if (!await this.hasTickDeviated(poolWithFetchedPositions, currentTick)) {
            const notDeviatedTimes = await this.incrementNotDeviatedTimes()
            this.logger.log(
                `[Tick Check] Current tick: ${currentTick}, Not deviated count: ${notDeviatedTimes}/${NOT_DEVIATED_TIMES}. ` +
                "Accumulating data to ensure tick stability before reset."
            )
            if (notDeviatedTimes >= NOT_DEVIATED_TIMES) {
                await this.resetCachedCurrentTick()
                await this.resetCachedNotDeviatedTimes()
            }
        }
    }

    public getLowerAndUpperTicks(pool: Pool) {
        const tickSpacing = Number(pool.tickSpacing)
        const current = pool.current_tick_index
        return {
            tickPrev: Math.floor(current / tickSpacing) * tickSpacing,
            tickNext: Math.ceil(current / tickSpacing) * tickSpacing,
        }
    }

    public checkEligibleToClosePosition(tickDiff: number, tickSpacing: number) {
        if (tickDiff < Number(tickSpacing)) {
            return false
        }
        const tickSpacingPartial = Math.floor(tickSpacing / 3)
        const remainderFromTickSpacing = tickDiff % tickSpacing
        return remainderFromTickSpacing <= Number(tickSpacingPartial)
    }

    public checkEligibleToAddLiquidity(
        zeroInsteadOne: boolean, 
        currentTick: number, 
        tickSpacing: number
    ) {
        const remainderFromTickSpacing = currentTick % tickSpacing
        const tickSpacingPartial = Math.floor(tickSpacing / 3)
        const distance = zeroInsteadOne ? 
            tickSpacing - remainderFromTickSpacing : 
            remainderFromTickSpacing
        return distance <= Number(tickSpacingPartial)
    }
}
