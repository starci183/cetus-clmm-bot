import { Inject, Injectable } from "@nestjs/common"
import { TokenId, tokens } from "./tokens"
import BN from "bn.js"
import { CETUS } from "./constants"
import { CetusClmmSDK } from "@cetusprotocol/cetus-sui-clmm-sdk"
import { envConfig } from "../env"

const MIN_SUI_BALANCE = new BN(5).mul(
    new BN(10).pow(new BN(tokens[TokenId.Sui].decimals - 1)),
) // 0.5 SUI

@Injectable()
export class BalanceManagerService {
    constructor(
    @Inject(CETUS)
    private readonly cetusClmmSdk: CetusClmmSDK,
    ) {}

    public async calculateAvailableLiquidityAmount(tokenId: TokenId): Promise<[BN, boolean]> {
        const { totalBalance } = await this.cetusClmmSdk.fullClient.getBalance({
            coinType: tokens[tokenId].address,
            owner: envConfig().sui.walletAddress,
        })
        let maxAmount = new BN(totalBalance)
        if (tokenId === TokenId.Sui) {
            maxAmount = maxAmount.sub(MIN_SUI_BALANCE)
        }
        return [maxAmount, maxAmount.gt(new BN(0))]
    }
}
