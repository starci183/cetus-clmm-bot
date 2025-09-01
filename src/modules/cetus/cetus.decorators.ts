import { Inject } from "@nestjs/common"
import { CETUS, CETUS_AGGREGATOR, CETUS_ZAP_SDK, SUI_CLIENT } from "./constants"

export const InjectCetus = () => Inject(CETUS)
export const InjectCetusAggregator = () => Inject(CETUS_AGGREGATOR)
export const InjectSuiClient = () => Inject(SUI_CLIENT)
export const InjectCetusZapSdk = () => Inject(CETUS_ZAP_SDK)