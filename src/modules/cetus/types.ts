import { Pool, Position } from "@cetusprotocol/cetus-sui-clmm-sdk"
import { ProfilePairSchema } from "../databases"

export interface PoolWithPosition {
    pool: Pool
    position: Position
    profilePair: ProfilePairSchema
}