
import { Provider } from "@nestjs/common"
import { CETUS, CETUS_AGGREGATOR, SUI_CLIENT } from "./constants"
import CetusClmmSDK, { initCetusSDK } from "@cetusprotocol/cetus-sui-clmm-sdk"
import { envConfig } from "../env"
import { AggregatorClient  } from "@cetusprotocol/aggregator-sdk"
import { SuiClient } from "@mysten/sui/client"

export const getCetusProvider = (): Provider<CetusClmmSDK> => ({
    provide: CETUS,
    useFactory: (): CetusClmmSDK => {
        return initCetusSDK({
            network: "mainnet",
            wallet: envConfig().sui.walletAddress,
            fullNodeUrl: "https://api.zan.top/node/v1/sui/mainnet/22d120019ccb45599c4c09f715e0f42b"
        })
    }
})

export const getCetusAggregatorProvider = (): Provider<AggregatorClient> => ({
    provide: CETUS_AGGREGATOR,
    useFactory: (): AggregatorClient => {
        return new AggregatorClient({
        })
    }
})

export const getSuiClientProvider = (): Provider<SuiClient> => ({
    provide: SUI_CLIENT,
    useFactory: (): SuiClient => {
        return new SuiClient({
            url: "https://api.zan.top/node/v1/sui/mainnet/22d120019ccb45599c4c09f715e0f42b"
        })
    }
})