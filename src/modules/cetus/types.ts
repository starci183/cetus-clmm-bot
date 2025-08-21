import { Pool, Position } from "@cetusprotocol/cetus-sui-clmm-sdk"
import { Pair } from "./pairs"

export interface PoolWithFetchedPositions {
    pool: Pool
    // we store multiple positions for a pool
    // but we only use the  first position to ensure bot work with the pool
    positions: Array<Position>
    // mainTokenLeftOrRight is the direction of the main token in the pool
    mainTokenLeftOrRight: "left" | "right"
    pair: Pair
}