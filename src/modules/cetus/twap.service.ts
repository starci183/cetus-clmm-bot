import { Injectable, Logger } from "@nestjs/common"
import { InjectCache, createCacheKey } from "../cache"
import { Cache } from "cache-manager"
import { PairId, roundNumber } from "../common"
import dayjs from "dayjs"

export interface TWAPTick {
    timestamp: number;
    currentTick: number;
}

// v2 twap
@Injectable()
export class CetusTWAPService {
    private readonly logger = new Logger(CetusTWAPService.name)
    constructor(
        @InjectCache()
        private readonly cache: Cache,
    ) { }

    public createTicksCacheKey(
        pairId: PairId
    ) {
        return createCacheKey(pairId, "twap")
    }

    public async getTicks(
        pairId: PairId
    ) {
        const key = this.createTicksCacheKey(pairId)
        const ticks = await this.cache.get<Array<TWAPTick>>(key)
        if (!ticks) {
            return []
        }
        return ticks
    }

    public async addTick(
        pairId: PairId,
        currentTick: number
    ) {
        const key = this.createTicksCacheKey(pairId)
        const ticks = await this.getTicks(pairId)
        if (!ticks) {
            return []
        }
        if (ticks.length >= 100) {
            // remove the first tick
            ticks.shift()
        }
        ticks.push({
            timestamp: dayjs().valueOf(),
            currentTick,
        })
        await this.cache.set(key, ticks)
    }

    public async checkVolatility({
        pairId,
        // mean that 3s it move about 9 ticks
        threshold = 3,
        tickSpacing, // 40 ticks = 10s
    }: CheckVolatilityParams): Promise<CheckVolatilityResult> {
        const _threshold = roundNumber((threshold * tickSpacing) / 40)
        const ticks = await this.getTicks(pairId)
        if (!ticks.length || ticks.length < 2) {
            return { isVolatile: false, delta: 0, isLoading: true }
        }
        const [secondLastTick, lastTick] = ticks.slice(-2)
        // compute twap to guess the direction
        const twap = 
        (lastTick.currentTick - secondLastTick.currentTick) / (
            (lastTick.timestamp - secondLastTick.timestamp) / 1000
        )
        return {
            isVolatile: Math.abs(twap) >= _threshold,
            delta: twap,
            isLoading: false,
            direction: twap >= 0 ? "up" : "down"
        }
    }
}

export interface CheckVolatilityParams {
    pairId: PairId;
    threshold?: number;
    tickSpacing: number;
}

export interface CheckVolatilityResult {
    isVolatile: boolean;
    delta: number;
    isLoading: boolean;
    direction?: "up" | "down";
}
