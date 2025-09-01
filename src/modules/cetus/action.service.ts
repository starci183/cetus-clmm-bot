import { Injectable, Logger } from "@nestjs/common"
import { PoolWithPosition } from "./types"
import CetusClmmSDK, {
    adjustForCoinSlippage,
    ClmmPoolUtil,
    Percentage,
    Pool,
    TickMath,
} from "@cetusprotocol/cetus-sui-clmm-sdk"
import BN from "bn.js"
import { InjectCetus } from "./cetus.decorators"
import { CetusSignerService } from "./cetus-signer.service"
import { TickManagerService } from "./tick-manager.service"
import { BalanceManagerService } from "./balance-manager.service"
import {
    InjectMongoose,
    LiquidityRangeSchema,
    MemDbService,
    PairSchema,
    ProfilePairSchema,
    TokenSchema,
} from "../databases"
import { Connection } from "mongoose"
import { CetusTxRateLimiterService } from "./cetus-rate-limiter.service"
import { CetusTWAPService } from "./twap.service"

@Injectable()
export class CetusActionService {
    private readonly logger = new Logger(CetusActionService.name)

    constructor(
    @InjectCetus()
    private readonly cetusClmmSdk: CetusClmmSDK,
    private readonly cetusSignerService: CetusSignerService,
    private readonly balanceManagerService: BalanceManagerService,
    private readonly tickManagerService: TickManagerService,
    private readonly memdbService: MemDbService,
    @InjectMongoose()
    private readonly connection: Connection,
    private readonly cetusTxRateLimiterService: CetusTxRateLimiterService,
    private readonly cetusTWAPService: CetusTWAPService,
    ) {}

    async closePosition({ pool, position }: PoolWithPosition) {
        const lower_tick = Number(position.tick_lower_index)
        const upper_tick = Number(position.tick_upper_index)

        const lower_sqrt_price = TickMath.tickIndexToSqrtPriceX64(lower_tick)
        const upper_sqrt_price = TickMath.tickIndexToSqrtPriceX64(upper_tick)

        const liquidity = new BN(position.liquidity)
        const slippage_tolerance = new Percentage(new BN(5), new BN(100))
        const cur_sqrt_price = new BN(pool.current_sqrt_price)

        const coin_amounts = ClmmPoolUtil.getCoinAmountFromLiquidity(
            liquidity,
            cur_sqrt_price,
            lower_sqrt_price,
            upper_sqrt_price,
            false,
        )
        const { tokenMaxA, tokenMaxB } = adjustForCoinSlippage(
            coin_amounts,
            slippage_tolerance,
            false,
        )
        const close_position_payload =
      await this.cetusClmmSdk.Position.closePositionTransactionPayload({
          coinTypeA: pool.coinTypeA,
          coinTypeB: pool.coinTypeB,
          min_amount_a: tokenMaxA.toString(),
          min_amount_b: tokenMaxB.toString(),
          rewarder_coin_types: pool.rewarder_infos.map(
              (rewarder) => rewarder.coinAddress,
          ),
          pool_id: pool.poolAddress,
          pos_id: position.pos_object_id,
          collect_fee: true,
      })
        const transferTxn = await this.cetusClmmSdk.fullClient.sendTransaction(
            this.cetusSignerService.getSigner(),
            close_position_payload,
        )
        if (transferTxn?.effects?.status.status === "failure") {
            throw new Error(transferTxn.effects.status.error)
        }
        if (transferTxn?.digest) {
            await this.cetusClmmSdk.fullClient.waitForTransaction({
                digest: transferTxn?.digest,
            })
            await this.cetusTxRateLimiterService.increaseTxCount()
        }
        this.logger.log(
            `Close position ${position.pos_object_id} successfully, Tx has: ${transferTxn?.digest}`,
        )
    }

    async addLiquidityFixToken(pool: Pool, profilePair: ProfilePairSchema): Promise<boolean> {
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
            this.logger.warn(`[${pair.displayId}] Pair is volatile, delta: ${delta}`)
            return false
        }
        // check if can add liquidity
        if (!this.tickManagerService.canAddLiquidity(pool, profilePair)) {
            this.logger.warn("Cannot add liquidity at current tick, skipping...")
            return false
        }
        const priorityAOverB = this.memdbService.priorityAOverB(profilePair)
        const tokenToAdd = (
      priorityAOverB ? pair.tokenA : pair.tokenB
    ) as TokenSchema
        const { maxAmount, isAvailable } =
      await this.balanceManagerService.calculateAvailableBalance(
          tokenToAdd.displayId,
          profilePair.capitalAllocatedMax,
      )
        if (!isAvailable) {
            this.logger.error("No enough balance to add liquidity, skipping...")
            return false
        }
        const tickSpacing = this.tickManagerService.tickSpacing(pool)
        const [tickLower, tickUpper] = this.tickManagerService.tickBounds(pool)

        const positionTickLower = priorityAOverB
            ? tickUpper
            : tickLower - tickSpacing
        const positionTickUpper = positionTickLower + tickSpacing
        const slippageTolerance = 0.005 // 0.5%
        const fixedAmountA = priorityAOverB
        //const currentSqrtPrice = new BN(pool.current_sqrt_price)
        const amounts = {
            coinA: new BN(priorityAOverB ? maxAmount : 0),
            coinB: new BN(priorityAOverB ? 0 : maxAmount),
        }
        const addLiquidityFixedTokenPayload = 
        await this.cetusClmmSdk.Position.createAddLiquidityFixTokenPayload({
            coinTypeA: pool.coinTypeA,
            coinTypeB: pool.coinTypeB,
            pool_id: pool.poolAddress,
            tick_lower: positionTickLower.toString(),
            tick_upper: positionTickUpper.toString(),
            fix_amount_a: fixedAmountA,
            amount_a: amounts.coinA.toString(),
            amount_b: amounts.coinB.toString(),
            slippage: slippageTolerance,
            is_open: true,
            rewarder_coin_types: pool.rewarder_infos.map(
                (rewarder) => rewarder.coinAddress,
            ),
            pos_id: "",
            collect_fee: false,
        })

        // prev balance before send txn
        const prevBalance = await this.balanceManagerService.getBalance(
            tokenToAdd.displayId,
        )
        const txn = await this.cetusClmmSdk.fullClient.sendTransaction(
            this.cetusSignerService.getSigner(),
            addLiquidityFixedTokenPayload,
        )
        const afterBalance = await this.balanceManagerService.getBalance(
            tokenToAdd.displayId,
        )
        if (txn?.effects?.status.status === "failure") {
            throw new Error(txn.effects.status.error)
        }
        await this.connection
            .model<LiquidityRangeSchema>(LiquidityRangeSchema.name)
            .create({
                profilePair: profilePair.id,
                tickIndexBoundLower: positionTickLower,
                tickIndexBoundUpper: positionTickUpper,
                currentTickAtCreation: pool.current_tick_index,
                originalCapital: prevBalance - afterBalance,
            })
        this.logger.log(
            `Add liquidity successfully, Tx has: ${txn?.digest}`,
        )
        if (txn?.digest) {
            await this.cetusClmmSdk.fullClient.waitForTransaction({
                digest: txn?.digest,
            })
            await this.cetusTxRateLimiterService.increaseTxCount()
        }
        return true
    }
}
