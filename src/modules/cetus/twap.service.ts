import { Injectable, Logger } from "@nestjs/common"
import { InjectCache, createCacheKey } from "../cache"
import { Cache } from "cache-manager"
import { PairId, roundNumber } from "../common"
import { OnEvent } from "@nestjs/event-emitter"
import { CetusEvent } from "./events"
import { PoolWithPosition } from "./types"
import { PairSchema } from "../databases/mongodb/schemas"
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

    private createTicksCacheKey(pairId: PairId) {
        return createCacheKey(pairId, "twap")
    }

    private async getTicks(pairId: PairId) {
        const key = this.createTicksCacheKey(pairId)
        const ticks = await this.cache.get<Array<TWAPTick>>(key)
        if (!ticks) {
            return []
        }
        return ticks
    }

    private async addTick(pairId: PairId, tick: TWAPTick) {
        const key = this.createTicksCacheKey(pairId)
        const ticks = await this.getTicks(pairId)
        if (!ticks) {
            return []
        }
        if (ticks.length >= 100) {
            // remove the first tick
            ticks.shift()
        }
        ticks.push(tick)
        await this.cache.set(key, ticks)
    }

    @OnEvent(CetusEvent.PoolsUpdated)
    async handlePoolsUpdated(data: Partial<Record<string, PoolWithPosition>>) {
        for (const profilePairId of Object.keys(data)) {
            const poolWithPosition = data[profilePairId]
            if (!poolWithPosition) {
                throw new Error(`Pool with position ${profilePairId} not found`)
            }
            // add tick
            const tick = {
                timestamp: Date.now(),
                currentTick: poolWithPosition.pool.current_tick_index,
            }
            const pair = poolWithPosition.profilePair.pair as PairSchema
            await this.addTick(pair.displayId, tick)
        }
    }

    public async checkVolatility({
        pairId,
        windowSec = 10,
        threshold = 0.1,
        tickSpacing, // 40 ticks = 10s
    }: CheckVolatilityParams): Promise<CheckVolatilityCheckResult> {
        const _threshold = roundNumber((threshold * tickSpacing) / 40)
        const ticks = await this.getTicks(pairId)
        if (!ticks.length) return { isVolatile: false, delta: 0, isLoading: true }

        const since = dayjs().subtract(windowSec, "second").valueOf()
        const recentTicks = ticks.filter((t) => t.timestamp >= since)
        if (recentTicks.length < 2) return { isVolatile: false, delta: 0, isLoading: true }

        const minTick = Math.min(...recentTicks.map((t) => t.currentTick))
        const maxTick = Math.max(...recentTicks.map((t) => t.currentTick))

        const minTime = Math.min(...recentTicks.map((t) => t.timestamp))
        const maxTime = Math.max(...recentTicks.map((t) => t.timestamp))

        const delta = roundNumber(Math.abs((maxTick - minTick) / ((maxTime - minTime) / 1000)))
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
