import { Injectable, Logger, OnApplicationBootstrap, OnModuleInit } from "@nestjs/common"
import { CetusClmmSDK, initCetusSDK, Pool, Position, TickMath } from "@cetusprotocol/cetus-sui-clmm-sdk"

const IKA_ADDRESS = "0x7262fb2f7a3a14c888c438a3cd9b912469a58cf60f367352c46584262e8299aa::ika::IKA"
const SUI_ADDRESS = "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI"
const USDC_ADDRESS = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC"

export interface PoolData {
    pool: Pool
    position?: Position
}

const poolParamsArr = [
    {
        tokenA: SUI_ADDRESS,
        tokenB: IKA_ADDRESS,
        feeRate: 0.002, // 0.3% fee rate
    },
    // {
    //     tokenA: SUI_ADDRESS,
    //     tokenB: USDC_ADDRESS,
    //     feeRate: 0.05, // 0.05% fee rate
    // },
]

@Injectable()
export class CetusService implements OnApplicationBootstrap {
    private readonly logger = new Logger(CetusService.name)
    private readonly cetusClmmSdk: CetusClmmSDK
    // store pool data
    private pools: Array<PoolData> = []
    constructor() {
        // initialize the Cetus SDK with the wallet address from environment variables
        this.cetusClmmSdk = initCetusSDK({
            network: "mainnet",
            wallet: process.env.SUI_WALLET_ADDRESS,
        })
    }

    async onApplicationBootstrap() {
        // pools
        let pools: Array<Pool> = []
        for (const poolParams of poolParamsArr) {
            // fetch the pools for each pair    
            const pools = await this.cetusClmmSdk.Pool.getPoolByCoins(
                [poolParams.tokenA, poolParams.tokenB],
            )
            const pool = pools.find(pool => pool.fee_rate == (poolParams.feeRate * 1_000_000))
            if (!pool) {
                console.error(`Pool not found for ${poolParams.tokenA} and ${poolParams.tokenB} with fee rate ${poolParams.feeRate}`)
                continue
            }
            // fetch user positions for the pool
            const positions = await this.cetusClmmSdk.Position.getPositionList(
                process.env.SUI_WALLET_ADDRESS || "",
                ["0xc23e7e8a74f0b18af4dfb7c3280e2a56916ec4d41e14416f85184a8aab6b7789"] // use the pool address from the fetched pool,
            )
            this.pools.push({
                pool: pool,
                position: positions[0],
            })
        }
        const poolIndex = 0 // assuming we want to fetch data for the first pool
        // only play with pool 1
        const pool = this.pools[poolIndex].pool
        const tickSpacing = Number.parseInt(pool.tickSpacing)
        // calculate the previous and next tick indices based on the current tick index
        this.logger.verbose(this.pools[0].position)
        this.logger.verbose(`Current tick index: ${pool.current_tick_index}`)
        this.logger.verbose(`Position range: ${this.pools[0].position?.tick_lower_index} - ${this.pools[0].position?.tick_upper_index}`)
        // Check if out of range
        if (
            pool.current_tick_index < (this.pools[0].position?.tick_lower_index || 0) ||
            pool.current_tick_index > (this.pools[0].position?.tick_upper_index || 0)
        ) {
            this.logger.warn("Position is out of range")
            return
        }
    }
}