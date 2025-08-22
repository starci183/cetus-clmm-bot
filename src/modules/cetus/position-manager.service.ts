import { Inject, Injectable, Logger } from "@nestjs/common"
import { OnEvent } from "@nestjs/event-emitter"
import { PairId } from "./pairs"
import { CetusEvent } from "./events"
import { PoolWithFetchedPositions } from "./types"
import CetusClmmSDK, {
    TickMath,
    ClmmPoolUtil,
    adjustForCoinSlippage,
    Percentage,
} from "@cetusprotocol/cetus-sui-clmm-sdk"
import { CETUS } from "./constants"
import BN from "bn.js"
import { tokens } from "./tokens"
import { CetusSignerService } from "./cetus-signer.service"
import { Cache } from "cache-manager"
import { InjectCache } from "../cache"
import { TickManagerService } from "./tick-manager.service"
import { AllocationManagerService } from "./allocation-manager.service"
import { BalanceManagerService } from "./balance-manager.service"

@Injectable()
export class PositionManagerService {
    private readonly logger = new Logger(PositionManagerService.name)
    constructor(
    @Inject(CETUS) private cetusClmmSdk: CetusClmmSDK,
    private readonly cetusSigner: CetusSignerService,
    @InjectCache()
    private readonly cacheManager: Cache,
    private readonly tickManagerService: TickManagerService,
    private readonly allocationManagerService: AllocationManagerService,
    private readonly balanceManagerService: BalanceManagerService,
    ) {}

    private async closeThenOpenPosition(
        poolWithFetchedPositions: PoolWithFetchedPositions,
        zeroInsteadOne?: boolean,
    ) {
        const allocationExceeded =
      await this.allocationManagerService.checkAllocationExceeded()
        if (allocationExceeded) {
            this.logger.warn("Max allocations per 15 minutes reached, skipping...")
            return
        }
        await this.closePosition(poolWithFetchedPositions)
        await this.addLiquidityToTheNextTick(poolWithFetchedPositions, zeroInsteadOne)
        // after finish, we increment the allocation
        await this.allocationManagerService.incrementAllocation()
    }

  @OnEvent(CetusEvent.PoolsUpdated)
    async handlePoolsUpdated(
        params: Partial<Record<PairId, PoolWithFetchedPositions>>,
    ) {
    // for example, we current work for first position and for the first pool
        const poolWithFetchedPositions = params[PairId.SuiIka02]
        if (!poolWithFetchedPositions) {
            throw new Error("Pool not found")
        }
        // tick manager
        const currentTick = await this.tickManagerService.getOrCacheCurrentTick(
            poolWithFetchedPositions,
        )
        await this.tickManagerService.resetCurrentTickIfNotDeviated(
            poolWithFetchedPositions,
            currentTick,
        )
        const { positions, pair } = poolWithFetchedPositions
        if (!positions || positions.length === 0) {
            this.logger.verbose("No positions found, creating a new position")
            // we create a position on the left
            await this.addLiquidityToTheNextTick(poolWithFetchedPositions)
            return
        }
        const { isOutOfRange, leftOrRight } =
      await this.getFirstPositionRangeStatus(poolWithFetchedPositions)
        if (!isOutOfRange) {
            // reset the current tick since we are still in range
            this.logger.debug("Position is still in range, earning fees...")
            return
        }
        this.logger.warn(
            `Position is out of range, current tick is ${leftOrRight} of your position`,
        )
        if (leftOrRight === "right") {
            this.logger.verbose(
                `Position is out of range (right), convert to fully ${tokens[pair.token1].name}`,
            )
            const tickDiff = Math.abs(
                Number(poolWithFetchedPositions.pool.current_tick_index) -
          Number(positions[0].tick_upper_index),
            )
            this.logger.verbose(
                `Tick diff: ${tickDiff}, tick spacing: ${poolWithFetchedPositions.pool.tickSpacing}.`,
            )
            if (
                !this.tickManagerService.checkEligibleToClosePosition(
                    tickDiff,
                    Number(poolWithFetchedPositions.pool.tickSpacing),
                )
            ) {
                this.logger.verbose(
                    "Tick is not eligible to close position, skipping...",
                )
                return
            }
            await this.closeThenOpenPosition(
                poolWithFetchedPositions,
                false,
            )
        } else {
            this.logger.verbose(
                `Position is out of range (left), convert to fully ${tokens[pair.token0].name}`,
            )
            const tickDiff = Math.abs(
                Number(poolWithFetchedPositions.pool.current_tick_index) -
          Number(positions[0].tick_lower_index),
            )
            this.logger.verbose(
                `Tick diff: ${tickDiff}, tick spacing: ${poolWithFetchedPositions.pool.tickSpacing}.`,
            )
            if (
                !this.tickManagerService.checkEligibleToClosePosition(
                    tickDiff,
                    Number(poolWithFetchedPositions.pool.tickSpacing),
                )
            ) {
                this.logger.verbose(
                    "Tick is not eligible to close position, skipping...",
                )
                return
            }
            await this.closeThenOpenPosition(
                poolWithFetchedPositions,
                true,
            )
        }
    }

  // we check if the position is out of range
  async getFirstPositionRangeStatus(
      params: PoolWithFetchedPositions,
  ): Promise<GetFirstPositionRangeStatusResponse> {
      const { positions } = params
      const position = positions[0]
      if (!position) {
          throw new Error("Position not found")
      }

      const lowerTick = Number(position.tick_lower_index)
      const currentTick = Number(params.pool.current_tick_index)
      const upperTick = Number(position.tick_upper_index)

      if (lowerTick < currentTick && currentTick < upperTick) {
          return {
              isOutOfRange: false,
              leftOrRight: undefined,
          }
      }
      if (currentTick < lowerTick) {
          return {
              isOutOfRange: true,
              leftOrRight: "left",
          }
      }
      return {
          isOutOfRange: true,
          leftOrRight: "right",
      }
  }

  // we create a position on the left
  async addLiquidityToTheNextTick(
      params: PoolWithFetchedPositions,
      zeroInsteadOne?: boolean,
  ) {
      const { pool, pair } = params
      if (!zeroInsteadOne) {
          zeroInsteadOne = pair.defaultzeroInsteadOne
      }
      // STRICT - TO ENSURE ELIGIBLE TO ADD LIQUIDITY
      if (
          !this.tickManagerService.checkEligibleToAddLiquidity(
              zeroInsteadOne,
              Number(pool.current_tick_index),
              Number(pool.tickSpacing),
          )
      ) {
          this.logger.error("Tick is not eligible to add liquidity, skipping...")
          return
      }
      const [maxAmount, prepareToAdd] =
      await this.balanceManagerService.calculateAvailableLiquidityAmount(
          pair.token0,
      )
      if (!prepareToAdd) {
          this.logger.error("No liquidity available, skipping...")
          return
      }
      const { tickPrev, tickNext } =
      this.tickManagerService.getLowerAndUpperTicks(pool)
      const tickSpacing = Number.parseInt(pool.tickSpacing)
      // Define the lower tick
      const lowerTickIndex = zeroInsteadOne ? tickNext : tickPrev - tickSpacing
      const upperTickIndex = lowerTickIndex + tickSpacing
      this.logger.debug(
          `Current tick: ${pool.current_tick_index}, lower tick: ${lowerTickIndex}, upper tick: ${upperTickIndex}`,
      )
      const slippageTolerance = 0.01 // 0.1%
      const fixedAmountA = zeroInsteadOne
      //const currentSqrtPrice = new BN(pool.current_sqrt_price)
      const amounts = {
          coinA: new BN(zeroInsteadOne ? maxAmount : 0),
          coinB: new BN(zeroInsteadOne ? 0 : maxAmount),
      }
      const addLiquidityFixedTokenPayload =
      await this.cetusClmmSdk.Position.createAddLiquidityFixTokenPayload({
          coinTypeA: pool.coinTypeA,
          coinTypeB: pool.coinTypeB,
          pool_id: pool.poolAddress,
          tick_lower: lowerTickIndex.toString(),
          tick_upper: upperTickIndex.toString(),
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
      const transferTxn = await this.cetusClmmSdk.fullClient.sendTransaction(
          this.cetusSigner.getSigner(),
          addLiquidityFixedTokenPayload,
      )
      this.logger.fatal(
          `Add liquidity successfully, Tx has: ${transferTxn?.digest}`,
      )
  }

  async closePosition({ pool, positions }: PoolWithFetchedPositions) {
      // Fetch position data
      const position = positions[0]
      if (!position) {
          throw new Error("Position not found")
      }
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
          this.cetusSigner.getSigner(),
          close_position_payload,
      )
      this.logger.fatal(
          `Close position successfully, Tx has: ${transferTxn?.digest}`,
      )
  }
}

export interface GetFirstPositionRangeStatusResponse {
  // if the position is out of range, return the left or right
  isOutOfRange: boolean;
  // if the position is out of range, return the left or right
  leftOrRight?: "left" | "right";
}
