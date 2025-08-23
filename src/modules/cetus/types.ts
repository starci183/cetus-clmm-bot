import { Pool, Position } from "@cetusprotocol/cetus-sui-clmm-sdk"
import { PairSchema, TokenSchema } from "../databases"

export interface PoolWithPosition {
    pool: Pool
    position: Position
    pair: PairSchema
    priorityToken: TokenSchema
}