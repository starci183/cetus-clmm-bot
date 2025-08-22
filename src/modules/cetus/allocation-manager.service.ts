import { Injectable } from "@nestjs/common"
import { InjectCache } from "../cache"
import { Cache } from "cache-manager"
import { Cron } from "@nestjs/schedule"

const CACHE_ALLOCATION_NAME = "ALLOCATION"
const CACHE_ALLOCATION_TTL = 1000 * 60 * 60 * 15 // 15 minutes
const MAX_ALLOCATIONS_PER_15_MINUTES = 1 // 1 allocation per 15 minutes

@Injectable()
export class AllocationManagerService {
    constructor(
        @InjectCache()
        private readonly cacheManager: Cache,
    ) { }

    // 15 minutes reset num allocations
    @Cron("0 */15 * * * *")
    async resetNumAllocations() {
        await this.resetCachedAllocation()
    }

    public async cacheAllocation(allocation: number) {
        await this.cacheManager.set(
            CACHE_ALLOCATION_NAME,
            allocation,
            CACHE_ALLOCATION_TTL,
        )
    }

    public async incrementAllocation() {
        const allocation = await this.getCachedAllocation()
        await this.cacheAllocation(allocation + 1)
    }

    public async getCachedAllocation() {
        return (await this.cacheManager.get<number>(CACHE_ALLOCATION_NAME)) || 0
    }

    public async resetCachedAllocation() {
        await this.cacheManager.del(CACHE_ALLOCATION_NAME)
    }

    public async checkAllocationExceeded() {
        const allocation = await this.getCachedAllocation()
        if (allocation && allocation >= MAX_ALLOCATIONS_PER_15_MINUTES) {
            return true
        }
        return false
    }
}
