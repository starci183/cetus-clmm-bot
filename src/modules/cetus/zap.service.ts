import { Injectable, Logger, OnModuleInit } from "@nestjs/common"
import { InjectCetusZapSdk } from "./cetus.decorators"
import CetusZapSDK from "@cetusprotocol/zap-sdk"
import { Pool } from "@cetusprotocol/cetus-sui-clmm-sdk"
import { MemDbService, PairSchema, ProfilePairSchema, TokenSchema } from "../databases"
import { TickManagerService } from "./tick-manager.service"
import { BalanceManagerService } from "./balance-manager.service"
import { CetusSignerService } from "./cetus-signer.service"
import { CetusTxRateLimiterService } from "./cetus-rate-limiter.service"
import { envConfig } from "../env"
import { CetusTWAPService } from "./twap.service"

@Injectable()
export class CetusZapService implements OnModuleInit {
    private readonly logger = new Logger(CetusZapService.name)
    constructor(
        @InjectCetusZapSdk() private cetusZapSdk: CetusZapSDK,
        private readonly tickManagerService: TickManagerService,
        private readonly memDbService: MemDbService,
        private readonly balanceManagerService: BalanceManagerService,
        private readonly cetusSignerService: CetusSignerService,
        private readonly cetusTxRateLimiterService: CetusTxRateLimiterService,
        private readonly cetusTWAPService: CetusTWAPService,
    ) {}

    onModuleInit() {
        this.cetusZapSdk.setSenderAddress(envConfig().sui.walletAddress)
    }

    async depositOneSideFixToken(
        pool: Pool,
        profilePair: ProfilePairSchema,
    ) {
        /// PROTECT HERE
        // check if pair is volatile
        const pair = profilePair.pair as PairSchema
        const { isVolatile, delta, isLoading } = await this.cetusTWAPService.checkVolatility({
            pairId: pair.displayId,
        })
        if (isLoading) {
            this.logger.warn(`[${pair.displayId}] loading for twap...`)
            return false
        }
        if (isVolatile) {
            this.logger.warn(`[${pair.displayId}] Pair is volatile to zap then add liquidity, delta: ${delta}`)
            return false
        }
        // check if can add zap liquidity
        if (!this.tickManagerService.canZapAddLiquidity(pool, profilePair)) {
            this.logger.warn("Cannot zap add liquidity at current tick to zap then add liquidity, skipping...")
            return false
        }
        const [tickLower, tickUpper] = this.tickManagerService.tickBounds(pool) 
        const priorityAOverB = this.memDbService.priorityAOverB(profilePair)
        const slippage = 0.005
        const tokenToAdd = (
            priorityAOverB ? pair.tokenA : pair.tokenB
          ) as TokenSchema
        const tokenA = pair.tokenA as TokenSchema
        const tokenB = pair.tokenB as TokenSchema
        const { maxAmount, isAvailable } =
            await this.balanceManagerService.calculateAvailableBalance(
                tokenToAdd.displayId,
                profilePair.capitalAllocatedMax,
            )
        if (!isAvailable) {
            this.logger.error("No enough balance to zap, skipping...")
            return false
        }
        const depositObj = await this.cetusZapSdk.Zap.preCalculateDepositAmount(
            {
                pool_id: pool.poolAddress,
                tick_lower: tickLower,
                tick_upper: tickUpper,
                current_sqrt_price: pool.current_sqrt_price.toString(),
                slippage,
            },
            {
                mode: priorityAOverB ? "OnlyCoinA" : "OnlyCoinB",
                coin_amount: maxAmount.toString(),
                coin_decimal_a: tokenA.decimals,
                coin_type_a: pool.coinTypeA,
                coin_type_b: pool.coinTypeB,
                coin_decimal_b: tokenB.decimals,
            },
        )
        const depositPayload = await this.cetusZapSdk.Zap.buildDepositPayload({
            deposit_obj: depositObj,
            pool_id: pool.poolAddress,
            coin_type_a: pool.coinTypeA,
            coin_type_b: pool.coinTypeB,
            tick_lower: tickLower,
            tick_upper: tickUpper   ,
            slippage,
        })
        const transferTxn = await this.cetusZapSdk.FullClient.sendTransaction(
            this.cetusSignerService.getSigner(),
            depositPayload,
        )
        if (transferTxn?.digest) {
            await this.cetusZapSdk.FullClient.waitForTransaction({
                digest: transferTxn?.digest,
            })
            await this.cetusTxRateLimiterService.increaseTxCount()
        }
        return true
    }
}