
import { Provider } from "@nestjs/common"
import { CETUS, CETUS_AGGREGATOR, CETUS_ZAP_SDK, SUI_CLIENT } from "./constants"
import CetusClmmSDK, { initCetusSDK } from "@cetusprotocol/cetus-sui-clmm-sdk"
import { envConfig } from "../env"
import { AggregatorClient  } from "@cetusprotocol/aggregator-sdk"
import { SuiClient } from "@mysten/sui/client"
import CetusZapSDK from "@cetusprotocol/zap-sdk"

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

export const getCetusZapSdkProvider = (): Provider<CetusZapSDK> => ({
    provide: CETUS_ZAP_SDK,
    inject: [SUI_CLIENT],
    useFactory: (suiClient: SuiClient): CetusZapSDK => {
        return CetusZapSDK.createSDK({
            sui_client: suiClient,
        })
    }
})