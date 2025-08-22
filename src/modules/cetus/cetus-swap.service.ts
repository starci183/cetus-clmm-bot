import { Injectable, Logger, OnModuleInit } from "@nestjs/common"
import CetusClmmSDK, {
    adjustForSlippage,
    d,
    Percentage,
    Pool,
} from "@cetusprotocol/cetus-sui-clmm-sdk"
import { CETUS } from "./constants"
import { Inject } from "@nestjs/common"
import { CetusSignerService } from "./cetus-signer.service"
import { BalanceManagerService } from "./balance-manager.service"
import { Pair } from "./pairs"
import { tokens } from "./tokens"

@Injectable()
export class CetusSwapService implements OnModuleInit {
    private readonly logger = new Logger(CetusSwapService.name)
    constructor(
    @Inject(CETUS) private cetusClmmSdk: CetusClmmSDK,
    private readonly cetusSigner: CetusSignerService,
    private readonly balanceManagerService: BalanceManagerService,
    ) {}

    onModuleInit() {}

    public async zapSwap(pool: Pool, pair: Pair, zeroForOne: boolean = true) {
        const [maxAmount, prepareToAdd] =
      await this.balanceManagerService.calculateAvailableLiquidityAmount(
          pair.token0,
      )
        if (!prepareToAdd) {
            this.logger.error("No liquidity available, skipping...")
            return
        }
        const [token0, token1] = [pair.token0, pair.token1].map(
            (tokenId) => tokens[tokenId]    
        )
        const slippage = Percentage.fromDecimal(d(0.5))
        const response = await this.cetusClmmSdk.Swap.preswap({
            pool,
            currentSqrtPrice: pool.current_sqrt_price,
            coinTypeA: pool.coinTypeA,
            coinTypeB: pool.coinTypeB,
            decimalsA: token0.decimals,
            decimalsB: token1.decimals,
            a2b: zeroForOne,
            byAmountIn: true,
            amount: maxAmount.toString(),
        })
        const toAmount = response?.estimatedAmountOut
        const amountLimit = adjustForSlippage(toAmount, slippage, true)
        const swapPayload =
      await this.cetusClmmSdk.Swap.createSwapTransactionPayload({
          pool_id: pool.poolAddress,
          a2b: zeroForOne,
          amount: maxAmount.toString(), // temporary
          amount_limit: amountLimit.toString(), // no slippage
          coinTypeA: pool.coinTypeA,
          coinTypeB: pool.coinTypeB,
          by_amount_in: true,
      })
        const swapTxn = await this.cetusClmmSdk.fullClient.sendTransaction(
            this.cetusSigner.getSigner(),
            swapPayload,
        )
        this.logger.fatal(`Swap successfully, Tx has: ${swapTxn?.digest}`)
    }
}
