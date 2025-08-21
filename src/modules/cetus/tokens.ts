export interface Token {
    name: string
    address: string
    decimals: number
}

export enum TokenId {
    Sui = "sui",
    Ika = "ika",
    Usdc = "usdc",
    Walrus = "walrus",
    Cetus = "cetus",
}
export const tokens: Record<TokenId, Token> = {
    [TokenId.Sui]: {
        name: "Sui",
        address: "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI",
        decimals: 9,
    },
    [TokenId.Ika]: {
        name: "Ika",
        address: "0x7262fb2f7a3a14c888c438a3cd9b912469a58cf60f367352c46584262e8299aa::ika::IKA",
        decimals: 9,
    },
    [TokenId.Usdc]: {
        name: "USDC",
        address: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
        decimals: 6,
    },
    [TokenId.Walrus]: {
        name: "Walrus",
        address: "0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL",
        decimals: 9,
    },
    [TokenId.Cetus]: {
        name: "Cetus",
        address: "0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS",
        decimals: 9,
    },
}