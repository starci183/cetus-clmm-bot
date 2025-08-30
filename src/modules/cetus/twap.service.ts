import { Injectable, Logger } from "@nestjs/common"
import { InjectCache, createCacheKey } from "../cache"
import { Cache } from "cache-manager"
import { PairId, roundNumber } from "../common"
import dayjs from "dayjs"

export interface TWAPTick {
    timestamp: number;
    currentTick: number;
}

@Injectable()
export class CetusTWAPService {
    private readonly logger = new Logger(CetusTWAPService.name)
    constructor(
        @InjectCache()
        private readonly cache: Cache,
    ) { }

    public createTicksCacheKey(pairId: PairId) {
        return createCacheKey(pairId, "twap")
    }

    public async getTicks(pairId: PairId) {
        const key = this.createTicksCacheKey(pairId)
        const ticks = await this.cache.get<Array<TWAPTick>>(key)
        if (!ticks) {
            return []
        }
        return ticks
    }

    public async addTick(pairId: PairId, currentTick: number) {
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
        windowSec = 10,
        threshold = 0.5,
        tickSpacing, // 40 ticks = 10s
    }: CheckVolatilityParams): Promise<CheckVolatilityCheckResult> {
        const _threshold = roundNumber((threshold * tickSpacing) / 40)
        const ticks = await this.getTicks(pairId)
        if (!ticks.length) return { isVolatile: false, delta: 0, isLoading: true }

        const since = dayjs().subtract(windowSec, "second").valueOf()
        const recentTicks = ticks.filter(t => t.timestamp >= since)
        const tickValues = recentTicks.map(t => t.currentTick)
        const maxTick = Math.max(...tickValues)
        const minTick = Math.min(...tickValues)
        const delta = roundNumber((maxTick - minTick) / windowSec)
        return { isVolatile: delta >= _threshold, delta, isLoading: false }
    }
}

export interface CheckVolatilityParams {
    pairId: PairId;
    windowSec?: number;
    threshold?: number;
    tickSpacing: number;
}

export interface CheckVolatilityCheckResult {
    isVolatile: boolean;
    delta: number;
    isLoading: boolean;
}
