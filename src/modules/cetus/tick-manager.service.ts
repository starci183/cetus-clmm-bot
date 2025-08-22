import { Injectable, Logger } from "@nestjs/common"
import { Cache } from "cache-manager"
import { InjectCache } from "../cache"
import { PoolWithFetchedPositions } from "./types"
import { MixinService } from "./mixin.service"
import { tokens } from "./tokens"
import { Pool, TickMath } from "@cetusprotocol/cetus-sui-clmm-sdk"
import { Cron } from "@nestjs/schedule"
import { CetusSwapService } from "./cetus-swap.service"

const CACHE_TICK_NAME = "CURRENT_TICK"
const CACHE_TICK_TTL = 1000 * 60 * 60 * 24 * 3 // 3 days
const VIOLATE_STOP = 0.01 // 1%

@Injectable()
export class TickManagerService {
    private readonly logger = new Logger(TickManagerService.name)
    constructor(
        @InjectCache()
        private readonly cacheManager: Cache,
        private readonly mixinService: MixinService,
        private readonly cetusSwapService: CetusSwapService,
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

    public hasTickDeviated(
        poolWithFetchedPositions: PoolWithFetchedPositions,
        currentTick: number,
    ): [boolean, TokenConvert] {
        const { lowerTick, upperTick } = this.computeTickBoundaries(
            poolWithFetchedPositions,
            currentTick,
        )
        return [
            currentTick <= lowerTick || currentTick >= upperTick,
            currentTick <= lowerTick ? TokenConvert.Token0 : TokenConvert.Token1,
        ]
    }

    // return if the tick is deviated
    public async tryExecuteDeviationProtectionSwap(
        poolWithFetchedPositions: PoolWithFetchedPositions,
        currentTick: number,
    ) {
        const [isDeviated, tokenConvert] = this.hasTickDeviated(poolWithFetchedPositions, currentTick)
        if (isDeviated) {
            // const notDeviatedTimes = await this.incrementNotDeviatedTimes()
            // this.logger.log(
            //     `[Tick Check] Current tick: ${currentTick}, Not deviated count: ${notDeviatedTimes}/${NOT_DEVIATED_TIMES}. ` +
            //     "Accumulating data to ensure tick stability before reset."
            // )
            // if (notDeviatedTimes >= NOT_DEVIATED_TIMES) {
            //     await this.resetCachedCurrentTick()
            //     await this.resetCachedNotDeviatedTimes()
            //     return false
            // }
            // return true
            //swap all liquidity to the rest of the pool
            await this.cetusSwapService.zapSwap(
                poolWithFetchedPositions.pool,
                poolWithFetchedPositions.pair,
                tokenConvert === TokenConvert.Token0,
            )
            return true
        }
        return false
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

export enum TokenConvert {
    Token0 = "token0",
    Token1 = "token1",
}