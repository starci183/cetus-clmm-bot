import { Injectable, Logger } from "@nestjs/common"
import { envConfig } from "../env"
import { PoolWithPosition } from "./types"
import { CetusClmmSDK } from "@cetusprotocol/cetus-sui-clmm-sdk"
import { Cron } from "@nestjs/schedule"
import { EventEmitter2 } from "@nestjs/event-emitter"
import { CetusEvent } from "./events"
import { InjectCetus } from "./cetus.decorators"
import { MemDbService } from "../databases"
import { PairSchema, ProfileSchema, TokenSchema } from "@/modules/databases"
import { RetryService } from "../mixin"

// pool manager is the place where pools are stored
@Injectable()
export class PoolManagerService {
    private readonly logger = new Logger(PoolManagerService.name)
    private cetusV3Pools: Partial<Record<string, PoolWithPosition>> = {}
    constructor(
        @InjectCetus() private cetusClmmSdk: CetusClmmSDK,
        private readonly eventEmitter: EventEmitter2,
        private readonly memDbService: MemDbService,
        private readonly retryService: RetryService,
    ) { }

    async onModuleInit() {
        await this.updatePoolState()
    }

    // update state each 10s
    // we use 4 rpc, rate limit is 100 request/30s
    // so we have 60 requests per 30s left
    @Cron("*/5 * * * * *")
    async updatePoolState() {
        await this.retryService.retry({
            action: async () => {
                for (const profile of this.memDbService.profiles) {
                    await this.updateSinglePool(profile)
                }
                this.eventEmitter.emit(CetusEvent.PoolsUpdated, this.cetusV3Pools)
            },
        })
    }

    private async updateSinglePool(profile: ProfileSchema) {
        const populatedProfile = this.memDbService.populateProfilePair(profile)
        for (const profilePair of populatedProfile.profilePairs) {
            const pair = profilePair.pair as PairSchema
            const tokenA = pair.tokenA as TokenSchema
            const tokenB = pair.tokenB as TokenSchema
            const pools = await this.cetusClmmSdk.Pool.getPoolByCoins([
                tokenA.address,
                tokenB.address,
            ])
            // get the first pool with the correct fee rate
            const pool = pools.find(
                (pool) => pool.fee_rate == pair.feeRate * 1_000_000,
            )
            if (!pool) {
                this.logger.error(
                    `Pool not found for ${tokenA.address} and ${tokenB.address} with fee rate ${pair.feeRate}`,
                )
                return
            }
            // get the positions for the pool
            const [position] = await this.cetusClmmSdk.Position.getPositionList(
                envConfig().sui.walletAddress,
                [pool.poolAddress], // use the pool address from the fetched pool,
            )
            this.cetusV3Pools[profilePair.id.toString()] = {
                pool,
                position,
                profilePair,
            }
            this.logger.debug(`Updated pool for ${pair.displayId}`)
        }
    }

    getPoolWithPosition(profilePairId: string) {
        return this.cetusV3Pools[profilePairId]
    }
}
