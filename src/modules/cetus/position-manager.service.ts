import { Inject, Injectable, Logger } from "@nestjs/common"
import { PoolManagerService } from "./pool-manager.service"
import { EventEmitter2, OnEvent } from "@nestjs/event-emitter"
import { PairId } from "./pairs"
import { CetusEvent } from "./events"
import { PoolWithFetchedPositions } from "./types"
import CetusClmmSDK, { ClmmPoolUtil, Pool, TickMath } from "@cetusprotocol/cetus-sui-clmm-sdk"
import { CETUS } from "./constants"
import BN from "bn.js"
import { tokens } from "./tokens"
@Injectable()
export class PositionManagerService {
    private readonly logger = new Logger(PositionManagerService.name)
    constructor(
        private readonly eventEmitter: EventEmitter2,
        private readonly poolManagerService: PoolManagerService,
        @Inject(CETUS) private cetusClmmSdk: CetusClmmSDK
    ) {}

    @OnEvent(CetusEvent.PoolsUpdated)
    async handlePoolsUpdated(
        pools: Partial<Record<PairId, PoolWithFetchedPositions>>
    ) {
        // for example, we current work for first position and for the first pool
        const poolWithFetchedPositions = pools[PairId.SuiIka02]
        if (!poolWithFetchedPositions) {
            throw new Error("Pool not found")
        }
        const { pool, positions, pair, mainTokenLeftOrRight } = poolWithFetchedPositions
        if (!positions || positions.length === 0) {
            this.logger.verbose("No positions found, creating a new position")
            // we create a position on the left
            await this.addLiquidityToTheNextTickRight(poolWithFetchedPositions)
            return
        }
        const { isOutOfRange, leftOrRight } = await this.getFirstPositionRangeStatus(poolWithFetchedPositions)
        if (isOutOfRange) {
            this.logger.log(`Position is out of range, adding liquidity to the ${leftOrRight}`)
        }
    }

    // we check if the position is out of range
    async getFirstPositionRangeStatus(
        pool: PoolWithFetchedPositions
    ): Promise<GetFirstPositionRangeStatusResponse> {
        const position = pool.positions[0]
        if (!position) {
            throw new Error("Position not found")
        }
        const currentTick = pool.pool.current_tick_index
        const isLeft = pool.mainTokenLeftOrRight === "left"
        let isOutOfRange = false
        const leftOrRight: "left" | "right" = isLeft ? "left" : "right"
        if (isLeft) {
            // if the position is out of range, return the left or right
            isOutOfRange = position.tick_lower_index > currentTick
        } else {
            // if the position is out of range, return the left or right
            isOutOfRange = position.tick_lower_index < currentTick
        }
        return {
            isOutOfRange,
            leftOrRight: isOutOfRange ? leftOrRight : undefined,
        }
    }

    private getLowerAndUpperTicks(pool: Pool) {
        const tickSpacing = Number.parseInt(pool.tickSpacing)
        const [tickPrev, tickNext] = [
            Math.floor(pool.current_tick_index / tickSpacing) * tickSpacing,
            Math.ceil(pool.current_tick_index / tickSpacing) * tickSpacing,
        ]
        return {
            tickPrev,
            tickNext,
        }
    }

    // we create a position on the left
    async addLiquidityToTheNextTickRight({ mainTokenLeftOrRight, pool, pair }: PoolWithFetchedPositions) {
        const { tickPrev, tickNext } = this.getLowerAndUpperTicks(pool)
        const tickSpacing = Number.parseInt(pool.tickSpacing)
        // Define the lower tick
        const lowerTickIndex = mainTokenLeftOrRight === "left" ?  tickNext : (tickPrev - tickSpacing)
        const upperTickIndex = lowerTickIndex + tickSpacing
        const amount = 1_000_000 // 1 sui
        const { token0, token1 } = pair
        const [token0Instance, token1Instance] = [token0, token1].map(token => tokens[token])
        const [
            token0Price,
            token1Price
        ] = [
            TickMath.tickIndexToPrice(
                lowerTickIndex,
                token0Instance.decimals,
                token1Instance.decimals,
            ), 
            TickMath.tickIndexToPrice(
                upperTickIndex,
                token0Instance.decimals,
                token1Instance.decimals,
            )
        ]
        console.log(token0Price, token1Price)
        // Define the upper tick
        const coinAmounts = ClmmPoolUtil.estCoinAmountsFromTotalAmount(
            lowerTickIndex,
            upperTickIndex,
            new BN(pool.current_sqrt_price),
            amount.toString(),
            token0Price.toString(),
            token1Price.toString()
        )
        console.log(coinAmounts)
        // const openPositionPayload = this.cetusClmmSdk.Position.openPositionTransactionPayload({
        //     coinTypeA: pool.coinTypeA,
        //     coinTypeB: pool.coinTypeB,
        //     pool_id: pool.poolAddress,
        //     tick_lower: lowerTick.toString(),
        //     tick_upper: upperTick.toString(),
        // })
        // const addLiquidityPayload = this.cetusClmmSdk.Position.createAddLiquidityPayload({
        //     delta_liquidity: coinAmounts[0],
        //     max_amount_a: coinAmounts[1],
        //     max_amount_b: coinAmounts[2],
        // })
    }
}

export interface GetFirstPositionRangeStatusResponse {
    // if the position is out of range, return the left or right
    isOutOfRange: boolean
    // if the position is out of range, return the left or right
    leftOrRight?: "left" | "right"
}