
import { Provider } from "@nestjs/common"
import { CETUS } from "./constants"
import CetusClmmSDK, { initCetusSDK } from "@cetusprotocol/cetus-sui-clmm-sdk"

export const getCetusProvider = (): Provider<CetusClmmSDK> => ({
    provide: CETUS,
    useFactory: (): CetusClmmSDK => {
        return initCetusSDK({
            network: "mainnet",
            wallet: process.env.SUI_WALLET_ADDRESS,
        })
    }
})
