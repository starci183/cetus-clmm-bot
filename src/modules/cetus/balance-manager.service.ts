import { Inject, Injectable } from "@nestjs/common"
import BN from "bn.js"
import { CETUS } from "./constants"
import { CetusClmmSDK } from "@cetusprotocol/cetus-sui-clmm-sdk"
import { envConfig } from "../env"
import { MemDbService, TokenId } from "../databases"
import { AmountHelpersService } from "../number"

@Injectable()
export class BalanceManagerService {
    constructor(
    @Inject(CETUS)
    private readonly cetusClmmSdk: CetusClmmSDK,
    private readonly memdbService: MemDbService,
    private readonly amountHelpersService: AmountHelpersService,
    ) { }

    private getMinSuiBalance(): BN {
        const token = this.memdbService.tokens.find(
            (token) => token.displayId === TokenId.Sui,
        )
        if (!token) {
            throw new Error(`Token ${TokenId.Sui} not found`)
        }
        return new BN(5).mul(new BN(10).pow(new BN(token.decimals - 1))) // 0.5 SUI
    }

    public async getBalance(tokenId: TokenId): Promise<number> {
        const token = this.memdbService.tokens.find(
            (token) => token.displayId === tokenId,
        )
        if (!token) {
            throw new Error(`Token ${tokenId} not found`)
        }
        const { totalBalance } = await this.cetusClmmSdk.fullClient.getBalance({
            coinType: token.address,
            owner: envConfig().sui.walletAddress,
        })
        return this.amountHelpersService.toDenomination(tokenId, new BN(totalBalance))
    }

    public async calculateAvailableBalance(
        tokenId: TokenId,
    ): Promise<CalculateAvailableBalanceResponse> {
        const token = this.memdbService.tokens.find(
            (token) => token.displayId === tokenId,
        )
        if (!token) {
            throw new Error(`Token ${tokenId} not found`)
        }
        const { totalBalance } = await this.cetusClmmSdk.fullClient.getBalance({
            coinType: token.address,
            owner: envConfig().sui.walletAddress,
        })
        let maxAmount = new BN(totalBalance)
        if (tokenId === TokenId.Sui) {
            maxAmount = maxAmount.sub(this.getMinSuiBalance())
        }
        return {
            maxAmount,
            isAvailable: maxAmount.gt(new BN(0)),
        }
    }
}

export interface CalculateAvailableBalanceResponse {
  maxAmount: BN;
  isAvailable: boolean;
}
