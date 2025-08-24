import { Injectable, Logger } from "@nestjs/common"
import { InjectCetusAggregator, InjectSuiClient } from "./cetus.decorators"
import { PairSchema, ProfilePairSchema, TokenSchema } from "../databases"
import { PoolManagerService } from "./pool-manager.service"
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
        private readonly poolManagerService: PoolManagerService,
        private readonly amountHelpersService: AmountHelpersService,
        private readonly cetusSignerService: CetusSignerService,
        private readonly balanceManagerService: BalanceManagerService,
    ) { }

    async swap({
        profilePair,
        amount,
        a2b,
        slippage = 0.005, // 0.5%
    }: SwapParams) {
        const poolWithPosition = this.poolManagerService.getPoolWithPosition(
            profilePair.id,
        )
        if (!poolWithPosition) {
            throw new Error("Pool not found")
        }
        const { profilePair: { pair, priorityToken } } = poolWithPosition
        const _pair = pair as PairSchema

        let rawAmount: BN
        if (amount) {
            rawAmount = this.amountHelpersService.toRaw(priorityToken.id, amount)
        } else {
            const { displayId } = priorityToken as TokenSchema
            const { maxAmount } = await this.balanceManagerService.calculateAvailableBalance(displayId)
            rawAmount = maxAmount
        }
        const tokenA = _pair.tokenA as TokenSchema
        const tokenB = _pair.tokenB as TokenSchema
        const tokenFrom = a2b ? tokenA.address : tokenB.address
        const tokenTarget = a2b ? tokenB.address : tokenA.address
        // router data v3
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
        this.logger.log(`Transaction digest: ${signedTx.digest}`)
    }
}
