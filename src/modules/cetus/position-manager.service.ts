import { Inject, Injectable, Logger } from "@nestjs/common"
import { OnEvent } from "@nestjs/event-emitter"
import { PairId } from "./pairs"
import { CetusEvent } from "./events"
import { PoolWithFetchedPositions } from "./types"
import CetusClmmSDK, {
    Pool,
    TickMath,
    ClmmPoolUtil,
    adjustForCoinSlippage,
    Percentage,
} from "@cetusprotocol/cetus-sui-clmm-sdk"
import { CETUS } from "./constants"
import BN from "bn.js"
import { tokens } from "./tokens"
import { CetusSignerService } from "./cetus-signer.service"
import { Cron, CronExpression } from "@nestjs/schedule"

const MAX_ALLOCATIONS_PER_5_MINS = 1

@Injectable()
export class PositionManagerService {
    private readonly logger = new Logger(PositionManagerService.name)
    private allocationsPer5Mins = 0
    constructor(
    @Inject(CETUS) private cetusClmmSdk: CetusClmmSDK,
    private readonly cetusSigner: CetusSignerService,
    ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
    async resetAllocationsPer5Mins() {
        this.allocationsPer5Mins = 0
    }

  private async closeThenOpenPosition(
      poolWithFetchedPositions: PoolWithFetchedPositions,
      zeroForOne?: boolean,
  ) {
      if (this.allocationsPer5Mins >= MAX_ALLOCATIONS_PER_5_MINS) {
          this.logger.warn("Max allocations per 5 mins reached, skipping...")
          return
      }
      this.allocationsPer5Mins++
      await this.closePosition(poolWithFetchedPositions)
      await this.addLiquidityToTheNextTick(poolWithFetchedPositions, zeroForOne)
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
          this.logger.debug("Position is still in range, earning fees...")
          return
      }
      this.logger.warn(
          `Position is out of range, current tick is ${leftOrRight} of your position`,
      )
      if (leftOrRight === "right") {
          this.logger.verbose(
              `Position is out of range (right), convert to fully ${pair.token1}`,
          )
          const tickDiff = Math.abs(
              Number(poolWithFetchedPositions.pool.current_tick_index) -
          Number(positions[0].tick_upper_index),
          )
          this.logger.verbose(
              `Tick diff: ${tickDiff}, tick spacing: ${poolWithFetchedPositions.pool.tickSpacing}.`,
          )
          if (tickDiff >= Number(poolWithFetchedPositions.pool.tickSpacing)) {
              this.logger.verbose(
                  "Tick diff is too large, we will close the position",
              )
              await this.closeThenOpenPosition(poolWithFetchedPositions, false)
              return
          }
          return
      } else {
          this.logger.verbose(
              `Position is out of range (left), convert to fully ${pair.token0}`,
          )
          const tickDiff = Math.abs(
              Number(poolWithFetchedPositions.pool.current_tick_index) -
          Number(positions[0].tick_lower_index),
          )
          this.logger.verbose(
              `Tick diff: ${tickDiff}, tick spacing: ${poolWithFetchedPositions.pool.tickSpacing}.`,
          )
          if (tickDiff >= Number(poolWithFetchedPositions.pool.tickSpacing)) {
              this.logger.verbose(
                  "Tick diff is too large, we will close the position",
              )
              await this.closeThenOpenPosition(poolWithFetchedPositions, true)
              return
          }
          return
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

  private getLowerAndUpperTicks(pool: Pool) {
      const tickSpacing = Number(pool.tickSpacing)
      const current = pool.current_tick_index
      return {
          tickPrev: Math.floor(current / tickSpacing) * tickSpacing,
          tickNext: Math.ceil(current / tickSpacing) * tickSpacing,
      }
  }

  // we create a position on the left
  async addLiquidityToTheNextTick(
      { pool, pair, amount }: PoolWithFetchedPositions,
      zeroForOne?: boolean,
  ) {
      this.allocationsPer5Mins++
      if (!zeroForOne) {
          zeroForOne = pair.defaultZeroForOne
      }
      const { tickPrev, tickNext } = this.getLowerAndUpperTicks(pool)
      const tickSpacing = Number.parseInt(pool.tickSpacing)
      // Define the lower tick
      const lowerTickIndex = zeroForOne ? tickNext : tickPrev - tickSpacing
      const upperTickIndex = lowerTickIndex + tickSpacing
      this.logger.debug(
          `Current tick: ${pool.current_tick_index}, lower tick: ${lowerTickIndex}, upper tick: ${upperTickIndex}`,
      )
      const [token0, token1] = [pair.token0, pair.token1].map(
          (token) => tokens[token],
      )
      const slippageTolerance = 0.005 // 0.1%
      const fixedAmountA = zeroForOne
      //const currentSqrtPrice = new BN(pool.current_sqrt_price)
      const amounts = {
          coinA: new BN(zeroForOne ? amount : 0).mul(
              new BN(10).pow(new BN(token0.decimals)),
          ),
          coinB: new BN(zeroForOne ? 0 : amount).mul(
              new BN(10).pow(new BN(token1.decimals)),
          ),
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
