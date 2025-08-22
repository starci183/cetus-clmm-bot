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
import { TokenId, tokens } from "./tokens"
import { CetusSignerService } from "./cetus-signer.service"
import { Cron, CronExpression } from "@nestjs/schedule"
import { envConfig } from "../env"
import { Cache } from "cache-manager"
import { InjectCache } from "../cache"

const VIOLATE_STOP = 0.01 // when price move 1% we stop
const MAX_ALLOCATIONS_PER_15_MINUTES = 1 // 1 allocation per 15 minutes
// cache keys
const cacheKeys = {
    currentTick: {
        name: "currentTick",
        ttl: 60 * 60 * 3 * 1, // 3 hours
    },
    numAllocations: {
        name: "numAllocations",
        ttl: 60 * 60 * 1, // 1 hour
    },
}

const MIN_SUI_BALANCE = new BN(5).mul(
    new BN(10).pow(new BN(tokens[TokenId.Sui].decimals - 1)),
) // 0.5 SUI

@Injectable()
export class PositionManagerService {
    private readonly logger = new Logger(PositionManagerService.name)
    constructor(
        @Inject(CETUS) private cetusClmmSdk: CetusClmmSDK,
        private readonly cetusSigner: CetusSignerService,
        @InjectCache()
        private readonly cacheManager: Cache,
    ) { }

    @Cron(CronExpression.EVERY_3_HOURS)
    async resetCurrentTick() {
        await this.cacheManager.del(cacheKeys.currentTick.name)
    }

    private computeTickBoundaries(
        poolWithFetchedPositions: PoolWithFetchedPositions,
        currentTick: number,
    ) {
        const { pool } = poolWithFetchedPositions
        const [token0, token1] = [pool.coinTypeA, pool.coinTypeB].map(
            (coinType) => tokens[coinType],
        )
        const priceAtCurrentTick = TickMath.tickIndexToPrice(
            currentTick,
            token0.decimals,
            token1.decimals,
        )
        const [lowerPrice, upperPrice] = [
            priceAtCurrentTick.mul(1 - VIOLATE_STOP),
            priceAtCurrentTick.mul(1 + VIOLATE_STOP),
        ]
        const [lowerTick, upperTick] = [
            TickMath.priceToTickIndex(lowerPrice, token0.decimals, token1.decimals),
            TickMath.priceToTickIndex(upperPrice, token0.decimals, token1.decimals),
        ]
        return {
            lowerTick,
            upperTick,
        }
    }

    @Cron("0 */15 * * * *")
    async resetnumAllocations() {
        await this.cacheManager.del(cacheKeys.numAllocations.name)
    }

    private async closeThenOpenPosition(
        poolWithFetchedPositions: PoolWithFetchedPositions,
        zeroForOne?: boolean,
    ) {
        const currentTick = await this.cacheManager.get<number>(
            cacheKeys.currentTick.name,
        )
        if (currentTick) {
            const { lowerTick, upperTick } = this.computeTickBoundaries(
                poolWithFetchedPositions,
                currentTick,
            )
            if (
                poolWithFetchedPositions.pool.current_tick_index < lowerTick ||
                poolWithFetchedPositions.pool.current_tick_index > upperTick
            ) {
                this.logger.warn(
                    `Price out of safe range: currentTick=${poolWithFetchedPositions.pool.current_tick_index}, lowerTick=${lowerTick}, upperTick=${upperTick}. Skipping allocation...`,
                )
                return
            }
        }
        const numAllocations = await this.cacheManager.get<number>(
            cacheKeys.numAllocations.name,
        )
        if (numAllocations && numAllocations >= MAX_ALLOCATIONS_PER_15_MINUTES) {
            this.logger.warn("Max allocations per 15 minutes reached, skipping...")
            return
        }
        await this.closePosition(poolWithFetchedPositions)
        await this.addLiquidityToTheNextTick(poolWithFetchedPositions, zeroForOne)

        // after finish, we update the num allocations
        await this.cacheManager.set(
            cacheKeys.numAllocations.name,
            (numAllocations || 0) + 1,
            cacheKeys.numAllocations.ttl,
        )
        if (!currentTick) {
            // set current tick
            await this.cacheManager.set(
                cacheKeys.currentTick.name,
                poolWithFetchedPositions.pool.current_tick_index,
                cacheKeys.currentTick.ttl,
            )
        }
    }

    private checkEligibleToClosePosition(tickDiff: number, tickSpacing: number) {
        if (tickDiff < Number(tickSpacing)) {
            return false
        }
        const tickSpacingPartial = Math.floor(tickSpacing / 3)
        const tickDiffPartial = tickDiff % tickSpacing
        return tickDiffPartial <= Number(tickSpacingPartial)
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
            if (
                this.checkEligibleToClosePosition(
                    tickDiff,
                    Number(poolWithFetchedPositions.pool.tickSpacing),
                )
            ) {
                this.logger.verbose(
                    "Tick diff is too large and near enough to the next tick, we will close the position",
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
            if (
                this.checkEligibleToClosePosition(
                    tickDiff,
                    Number(poolWithFetchedPositions.pool.tickSpacing),
                )
            ) {
                this.logger.verbose(
                    "Tick diff is too large and near enough to the next tick, we will close the position",
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
        { pool, pair }: PoolWithFetchedPositions,
        zeroForOne?: boolean,
    ) {
        if (!zeroForOne) {
            zeroForOne = pair.defaultZeroForOne
        }
        const [token0, token1] = [pair.token0, pair.token1].map(
            (token) => tokens[token],
        )
        // fetch balance of your zero or one token
        const balance = await this.cetusClmmSdk.fullClient.getBalance({
            coinType: zeroForOne ? token0.address : token1.address,
            owner: envConfig().sui.walletAddress,
        })
        // this help user always have enough balance to add liquidity
        // and some sui to pay for the transaction
        this.logger.debug(
            `Balance of ${zeroForOne ? pair.token0 : pair.token1}: ${balance.totalBalance}`,
        )
        let actualAmount = new BN(balance.totalBalance)
        if (actualAmount.eq(new BN(0))) {
            this.logger.warn("Balance is less than 0, skipping...")
            return
        }
        const tokenId = zeroForOne ? pair.token0 : pair.token1
        if (tokenId === TokenId.Sui) {
            if (new BN(balance.totalBalance).lt(MIN_SUI_BALANCE)) {
                this.logger.warn("Balance of SUI is less than 0.5, skipping...")
                return
            } else {
                actualAmount = new BN(balance.totalBalance).sub(MIN_SUI_BALANCE)
            }
        }
        const { tickPrev, tickNext } = this.getLowerAndUpperTicks(pool)
        const tickSpacing = Number.parseInt(pool.tickSpacing)
        // Define the lower tick
        const lowerTickIndex = zeroForOne ? tickNext : tickPrev - tickSpacing
        const upperTickIndex = lowerTickIndex + tickSpacing
        this.logger.debug(
            `Current tick: ${pool.current_tick_index}, lower tick: ${lowerTickIndex}, upper tick: ${upperTickIndex}`,
        )
        const slippageTolerance = 0.01 // 0.1%
        const fixedAmountA = zeroForOne
        //const currentSqrtPrice = new BN(pool.current_sqrt_price)
        const amounts = {
            coinA: new BN(zeroForOne ? actualAmount : 0),
            coinB: new BN(zeroForOne ? 0 : actualAmount),
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
        await this.cacheManager.set(
            cacheKeys.currentTick.name,
            pool.current_tick_index,
            cacheKeys.currentTick.ttl,
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
