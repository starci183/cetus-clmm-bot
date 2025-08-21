import { Pool, Position } from "@cetusprotocol/cetus-sui-clmm-sdk"
import { Pair, PairId } from "./pairs"

export interface PoolWithFetchedPositions {
    pool: Pool
    // we store multiple positions for a pool
    // but we only use the  first position to ensure bot work with the pool
    positions: Array<Position>
    pair: Pair
    pairId: PairId
}