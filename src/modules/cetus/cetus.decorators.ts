import { Inject } from "@nestjs/common"
import { CETUS, CETUS_AGGREGATOR, SUI_CLIENT } from "./constants"

export const InjectCetus = () => Inject(CETUS)
export const InjectCetusAggregator = () => Inject(CETUS_AGGREGATOR)
export const InjectSuiClient = () => Inject(SUI_CLIENT)