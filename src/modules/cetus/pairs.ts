import { TokenId } from "./tokens"

export interface Pair {
    token0: TokenId
    token1: TokenId
    feeRate: number
    defaultZeroInsteadOne: boolean
}

export interface PairAllocation {
    pairId: PairId
}

export enum PairId {
    SuiIka02 = "sui-ika-0.2",
    SuiUsdc05 = "sui-usdc-0.5",
}

export const pairs: Record<PairId, Pair> = {
    [PairId.SuiIka02]: {
        token0: TokenId.Ika,
        token1: TokenId.Sui,
        defaultZeroInsteadOne: true,
        feeRate: 0.002,
    },
    [PairId.SuiUsdc05]: {
        token0: TokenId.Sui,
        token1: TokenId.Usdc,
        defaultZeroInsteadOne: false,
        feeRate: 0.005,
    },
}

export interface CetusV3PoolConfig {
    pairId: PairId
}
  