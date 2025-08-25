import { Injectable, Logger } from "@nestjs/common"
import { Interval } from "@nestjs/schedule"
import { RateLimiterMemory } from "rate-limiter-flexible"

const TX_COUNT_KEY = "cetus"
@Injectable()
export class CetusTxRateLimiterService {
    private readonly logger = new Logger(CetusTxRateLimiterService.name)
    private limter = new RateLimiterMemory({
        points: 60,
        duration: 8 * 60 * 60
    })
    constructor() {}

    @Interval(10000)
    async logTxCount() {
        const result = await this.limter.get(TX_COUNT_KEY)
        this.logger.warn(`Tx count: ${result?.consumedPoints || 0}`)
    }

    public async increaseTxCount() {
        await this.limter.consume(TX_COUNT_KEY)
    }

    public async isRateLimitExceeded() {
        const result = await this.limter.get(TX_COUNT_KEY)
        return result ? result.remainingPoints <= 0 : false
    }
}

