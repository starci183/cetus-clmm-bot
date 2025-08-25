import { Injectable } from "@nestjs/common"
import { RateLimiterMemory } from "rate-limiter-flexible"

@Injectable()
export class CetusTxRateLimiterService {
    private limter = new RateLimiterMemory({
        points: 60,
        duration: 8 * 60 * 60
    })
    constructor() {}

    public async increaseTxCount() {
        await this.limter.consume("cetus")
    }

    public async isRateLimitExceeded() {
        const result = await this.limter.get("cetus")
        return result ? result.remainingPoints <= 0 : false
    }
}

