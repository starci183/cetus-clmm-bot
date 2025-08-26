import { Inject, Injectable, Logger } from "@nestjs/common"
import BN from "bn.js"
import { CETUS } from "./constants"
import { CetusClmmSDK } from "@cetusprotocol/cetus-sui-clmm-sdk"
import { envConfig } from "../env"
import { MemDbService, TokenId } from "../databases"
import { AmountHelpersService } from "../number"

@Injectable()
export class BalanceManagerService {
    private readonly logger = new Logger(BalanceManagerService.name)
    constructor(
    @Inject(CETUS)
    private readonly cetusClmmSdk: CetusClmmSDK,
    private readonly memdbService: MemDbService,
    private readonly amountHelpersService: AmountHelpersService,
    ) {}

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
        let _totalBalance: BN = new BN(totalBalance)
        if (tokenId === TokenId.Sui) {
            _totalBalance = new BN(totalBalance).sub(this.getMinSuiBalance())
        }
        const amount = this.amountHelpersService.toDenomination(
            tokenId,
            _totalBalance,
        )
        return amount
    }

    public async calculateAvailableBalance(
        tokenId: TokenId,
        capitalAllocatedMax: number = 20,
    ): Promise<CalculateAvailableBalanceResponse> {
        const token = this.memdbService.tokens.find(
            (token) => token.displayId === tokenId,
        )
        console.log(capitalAllocatedMax)
        if (!token) {
            throw new Error(`Token ${tokenId} not found`)
        }
        const { totalBalance } = await this.cetusClmmSdk.fullClient.getBalance({
            coinType: token.address,
            owner: envConfig().sui.walletAddress,
        })
        this.logger.warn(`Total balance: ${totalBalance}`)
        let maxAmount = new BN(totalBalance)
        if (tokenId === TokenId.Sui) {
            maxAmount = maxAmount.sub(this.getMinSuiBalance())
        }
        // const _capitalAllocatedMax = new BN(capitalAllocatedMax).mul(
        //     new BN(10).pow(new BN(token.decimals)),
        // )
        // maxAmount = maxAmount.gt(_capitalAllocatedMax)
        //     ? _capitalAllocatedMax
        //     : maxAmount
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
