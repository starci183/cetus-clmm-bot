import { Injectable, Logger } from "@nestjs/common"
import { RateLimiterMemory } from "rate-limiter-flexible"

export const MAX_TXS_PER_8_HOURS = 40
export const MAX_TXS_PER_8_HOURS_MS = 1000 * 60 * 60 * 8

export const MAX_TXS_PER_5_MINS = 4
export const MAX_TXS_PER_5_MINS_MS = 1000 * 60 * 5

@Injectable()
export class CetusRateLimitService {
    private readonly logger = new Logger(CetusRateLimitService.name)

    private per8HoursLimiter = new RateLimiterMemory({
        points: MAX_TXS_PER_8_HOURS,
        duration: MAX_TXS_PER_8_HOURS_MS / 1000,
    })

    private per5MinsLimiter = new RateLimiterMemory({
        points: MAX_TXS_PER_5_MINS,
        duration: MAX_TXS_PER_5_MINS_MS / 1000,
    })

    constructor() {}

    async executeWithRateLimit(action: () => Promise<void>) {
        // We try to get points
        const per8HoursPoints = await this.per8HoursLimiter.get("per8Hours")
        const per5MinsPoints = await this.per5MinsLimiter.get("per5Mins")
    
        if ((per8HoursPoints?.remainingPoints ?? 0) <= 0 ||
            (per5MinsPoints?.remainingPoints ?? 0) <= 0) {
            this.logger.warn(
                `Rate limit exceeded. Retry after: ${Math.max(
                    per8HoursPoints?.msBeforeNext ?? 0,
                    per5MinsPoints?.msBeforeNext ?? 0
                )} ms`
            )
            throw new Error("Rate limit exceeded")
        }
    
        // We consume points
        await this.per8HoursLimiter.consume("per8Hours")
        await this.per5MinsLimiter.consume("per5Mins")
    
        try {
            await action()
        } catch (err) {
            this.logger.error(`Action failed: ${err.message}`)
            throw err
        }
    }
}
