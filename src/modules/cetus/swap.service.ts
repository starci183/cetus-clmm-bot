import { Injectable, Logger } from "@nestjs/common"
import { InjectCetusAggregator, InjectSuiClient } from "./cetus.decorators"
import {
    MemDbService,
    PairSchema,
    ProfilePairSchema,
    TokenId,
    TokenSchema,
} from "../databases"
import { AmountHelpersService } from "@/modules/number"
import { AggregatorClient } from "@cetusprotocol/aggregator-sdk"
import { Transaction } from "@mysten/sui/transactions"
import { envConfig } from "../env"
import { CetusSignerService } from "./cetus-signer.service"
import { SuiClient } from "@mysten/sui/client"
import { BalanceManagerService } from "./balance-manager.service"
import BN from "bn.js"

export interface SwapParams {
  profilePair: ProfilePairSchema;
  amount?: number;
  a2b: boolean;
  slippage?: number;
}

@Injectable()
export class CetusSwapService {
    private readonly logger = new Logger(CetusSwapService.name)
    constructor(
    @InjectSuiClient()
    private readonly suiClient: SuiClient,
    @InjectCetusAggregator()
    private cetusAggregatorSdk: AggregatorClient,
    private readonly amountHelpersService: AmountHelpersService,
    private readonly cetusSignerService: CetusSignerService,
    private readonly balanceManagerService: BalanceManagerService,
    private readonly memdbService: MemDbService,
    ) {}

    public getMinAmountToSwap(tokenId: TokenId): BN {
        const token = this.memdbService.tokens.find(
            (token) => token.displayId === tokenId,
        )
        if (!token) {
            throw new Error(`Token ${tokenId} not found`)
        }
        return new BN(1).mul(new BN(10).pow(new BN(token.decimals))) // 1
    }

    async swap({
        profilePair,
        amount,
        a2b,
        slippage = 0.005, // 0.5%
    }: SwapParams) {
        const pair = profilePair.pair as PairSchema
        let rawAmount: BN
        const tokenA = pair.tokenA as TokenSchema
        const tokenB = pair.tokenB as TokenSchema
        const fromToken = a2b ? tokenA : tokenB
        const toToken = a2b ? tokenB : tokenA
        if (amount) {
            rawAmount = this.amountHelpersService.toRaw(fromToken.id, amount)
        } else {
            const { displayId } = fromToken as TokenSchema
            const { maxAmount } =
        await this.balanceManagerService.calculateAvailableBalance(
            displayId,
            profilePair.capitalAllocatedMax,
        )
            rawAmount = maxAmount
        }
        this.logger.warn(`Amount to swap: ${rawAmount.toString()}`)
        if (rawAmount.lt(this.getMinAmountToSwap(fromToken.displayId))) {
            this.logger.warn(
                `Not enough balance to swap ${rawAmount.toString()} ${fromToken.displayId}`,
            )
            return
        }
        const tokenFrom = fromToken.address
        const tokenTarget = toToken.address
        // router data v3
        this.logger.debug(
            `[${pair.displayId}] Swapping ${rawAmount.toString()} ${tokenFrom} to ${tokenTarget}`,
        )
        const routerDataV3 = await this.cetusAggregatorSdk.findRouters({
            amount: rawAmount,
            byAmountIn: true,
            from: tokenFrom,
            target: tokenTarget,
        })
        if (!routerDataV3) {
            this.logger.error(
                `No router data v3 found for ${tokenFrom} to ${tokenTarget}`,
            )
            return
        }
        const txb = new Transaction()
        txb.setSender(envConfig().sui.walletAddress)
        await this.cetusAggregatorSdk.fastRouterSwap({
            router: routerDataV3,
            slippage,
            txb,
        })
        const signedTx = await this.suiClient.signAndExecuteTransaction({
            transaction: txb,
            signer: this.cetusSignerService.getSigner(),
        })
        if (signedTx?.digest) {
            await this.suiClient.waitForTransaction({
                digest: signedTx?.digest,
            })
        }
        this.logger.log(`Transaction digest: ${signedTx.digest}`)
    }
}
