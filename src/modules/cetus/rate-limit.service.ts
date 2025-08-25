import { Injectable, Logger } from "@nestjs/common"
import { Interval } from "@nestjs/schedule"

@Injectable()
export class CetusRateLimitService {
    private readonly maxTxPer8Hours = 40
    private txCountPer8Hours = 0
    private readonly logger = new Logger(CetusRateLimitService.name)
    constructor() {}

    @Interval(1000 * 60 * 60 * 8)
    async resetRateLimit() {
        this.txCountPer8Hours = 0
    }

    async executeWithRateLimit(action: () => Promise<void>) {
        if (this.txCountPer8Hours >= this.maxTxPer8Hours) {
            this.logger.error(
                "Rate limit exceeded"
            )
            return
        }
        try {
            await action()
            this.txCountPer8Hours++
        } catch (error) {
            this.logger.error(`Error executing action: ${error.message}`)
        }
    }
}
