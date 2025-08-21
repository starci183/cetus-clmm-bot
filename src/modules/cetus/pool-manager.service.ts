import { Inject, Injectable, Logger } from "@nestjs/common"
import { PairId, pairs } from "./pairs"
import SuperJSON from "superjson"
import { envConfig } from "../env"
import { PoolWithFetchedPositions } from "./types"
import { CETUS } from "./constants"
import { CetusClmmSDK } from "@cetusprotocol/cetus-sui-clmm-sdk"
import { Cron } from "@nestjs/schedule"
import { EventEmitter2 } from "@nestjs/event-emitter"
import { CetusEvent } from "./events"
import { tokens } from "./tokens"

// pool manager is the place where pools are stored
@Injectable()
export class PoolManagerService {
    private readonly logger = new Logger(PoolManagerService.name)
    private cetusV3PoolConfigs: Array<PairId> = []
    private cetusV3Pools: Partial<Record<PairId, PoolWithFetchedPositions>> = {}
    constructor(
        @Inject(CETUS) private cetusClmmSdk: CetusClmmSDK,
        private readonly eventEmitter: EventEmitter2
    ) {
        this.cetusV3PoolConfigs =
      // allow you to use custom pairs
      envConfig().pairs.jsonEncodedData
          ? SuperJSON.parse(envConfig().pairs.jsonEncodedData)
          : [
              PairId.SuiIka02, 
              //PairId.SuiUsdc05
          ]
    }

    // update state each 3s
    // we use 4 rpc, rate limit is 100 request/30s
    // so we have 60 requests per 30s left
    @Cron("*/3 * * * * *") 
    async updatePoolState() {
        for (const pairId of this.cetusV3PoolConfigs) {
            const pair = pairs[pairId]
            const [token0, token1] = [pair.token0, pair.token1].map(token => tokens[token])
            const pools = await this.cetusClmmSdk.Pool.getPoolByCoins(
                [token0.address, token1.address],
            )
            // get the first pool with the correct fee rate
            const pool = pools.find(pool => pool.fee_rate == (pair.feeRate * 1_000_000))
            if (!pool) {
                this.logger.error(
                    `Pool not found for ${pair.token0} and ${pair.token1} with fee rate ${pair.feeRate}`,
                )
                continue
            }
            // get the positions for the pool
            const positions = await this.cetusClmmSdk.Position.getPositionList(
                envConfig().sui.walletAddress,
                [pool.poolAddress], // use the pool address from the fetched pool,
            )
            // get the main token left or right
            this.cetusV3Pools[pairId] = {
                pool,
                positions,
                pair,
                mainTokenLeftOrRight: pool.coinTypeA === tokens[pair.token0].address ? "left" : "right",
            }
        }
        this.eventEmitter.emit(CetusEvent.PoolsUpdated, this.cetusV3Pools)
    }
}
