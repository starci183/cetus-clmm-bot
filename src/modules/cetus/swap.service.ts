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
import { CetusTxRateLimiterService } from "./cetus-rate-limiter.service"
import { sleep } from "@/modules/common"

export interface SwapParams {
  profilePair: ProfilePairSchema
  amount?: number
  a2b: boolean
  slippage?: number
}

export interface SwapResult {
  balanceEnough: boolean
  routeFound?: boolean
  digest?: string
  error?: string
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
    private readonly cetusTxRateLimiterService: CetusTxRateLimiterService,
    ) {}

    public getMinAmountToSwap(tokenId: TokenId): BN {
        const token = this.memdbService.tokens.find(
            (token) => token.displayId === tokenId,
        )
        if (!token) {
            throw new Error(`Token ${tokenId} not found`)
        }
        return new BN(10).pow(new BN(token.decimals)) // 1 unit of token
    }

    async swap({
        profilePair,
        amount,
        a2b,
        slippage = 0.005, // 0.5%
    }: SwapParams): Promise<SwapResult | undefined> {
        const maxCheck = 10
        let ignoreFirst = true
        for (let i = 0; i < maxCheck; i++) {
            try {
                const result = await this.swapCore({ profilePair, amount, a2b, slippage })
                this.logger.verbose(`Swap attempt #${i}: ${JSON.stringify(result)}`)
                if (result.balanceEnough && result.routeFound && result.digest) {
                    if (ignoreFirst) {
                        ignoreFirst = false
                        await sleep(100)
                    } else {
                        return result
                    }
                }
            } catch (error) {
                this.logger.error(`Swap attempt #${i} failed`, error.message)
                await sleep(100)
            }
        }

        this.logger.warn(`Swap failed after ${maxCheck} attempts`)
        return { balanceEnough: false, error: "Max attempts reached" }
    }

    async swapCore({
        profilePair,
        amount,
        a2b,
        slippage = 0.001, // 0.1%
    }: SwapParams): Promise<SwapResult> {
        const pair = profilePair.pair as PairSchema
        const tokenA = pair.tokenA as TokenSchema
        const tokenB = pair.tokenB as TokenSchema
        const fromToken = a2b ? tokenA : tokenB
        const toToken = a2b ? tokenB : tokenA

        // Amount to swap
        let rawAmount: BN
        if (amount) {
            rawAmount = this.amountHelpersService.toRaw(fromToken.id, amount)
        } else {
            const { displayId } = fromToken
            const { maxAmount } = await this.balanceManagerService.calculateAvailableBalance(
                displayId,
                profilePair.capitalAllocatedMax,
            )
            rawAmount = maxAmount
        }

        this.logger.warn(`Amount to swap: ${rawAmount.toString()}`)

        // Check minimum amount
        if (rawAmount.lt(this.getMinAmountToSwap(fromToken.displayId))) {
            this.logger.warn(
                `Not enough balance to swap ${rawAmount.toString()} ${fromToken.displayId}`,
            )
            return { balanceEnough: false, error: "Insufficient balance" }
        }

        // Find router
        const tokenFrom = fromToken.address
        const tokenTarget = toToken.address
        this.logger.debug(
            `[${pair.displayId}] Swapping ${rawAmount.toString()} ${tokenFrom} -> ${tokenTarget}`,
        )

        const routerDataV3 = await this.cetusAggregatorSdk.findRouters({
            amount: rawAmount,
            byAmountIn: true,
            from: tokenFrom,
            target: tokenTarget,
        })

        if (!routerDataV3) {
            this.logger.error(`No router data v3 found for ${tokenFrom} -> ${tokenTarget}`)
            return { balanceEnough: true, routeFound: false, error: "No route found" }
        }

        // Build and execute transaction
        const txb = new Transaction()
        txb.setSender(envConfig().sui.walletAddress)

        try {
            await this.cetusAggregatorSdk.fastRouterSwap({
                router: routerDataV3,
                slippage,
                txb,
            })

            const txn = await this.suiClient.signAndExecuteTransaction({
                transaction: txb,
                signer: this.cetusSignerService.getSigner(),
            })
            if (txn.effects?.status.status === "failure") {
                throw new Error(txn.effects.status.error)
            }
            if (txn?.digest) {
                await this.suiClient.waitForTransaction({ digest: txn.digest })
                await this.cetusTxRateLimiterService.increaseTxCount()
                this.logger.log(`Transaction success: ${txn.digest}`)
                return { balanceEnough: true, routeFound: true, digest: txn.digest }
            } else {
                return { balanceEnough: true, routeFound: true, error: "No digest returned" }
            }
        } catch (error) {
            this.logger.error("Transaction failed", error.message)
            return { balanceEnough: true, routeFound: true, error: error.message }
        }
    }
}