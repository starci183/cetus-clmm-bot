import { Module } from "@nestjs/common"
import { PoolManagerService } from "./pool-manager.service"
import { CetusSwapService } from "./swap.service"
// import { PositionManagerService } from "./position-manager.service"
// import { CetusSignerService } from "./cetus-signer.service"
import { getCetusAggregatorProvider, getCetusProvider, getSuiClientProvider } from "./cetus.providers"
import { ConfigurableModuleClass } from "./cetus.module-definition"
import { CetusSignerService } from "./cetus-signer.service"
// import { MixinService } from "./mixin.service"
// import { AllocationManagerService } from "./allocation-manager.service"
// import { TickManagerService } from "./tick-manager.service"
// import { BalanceManagerService } from "./balance-manager.service"
// import { CetusSwapService } from "./cetus-swap.service"
@Module({
    providers: [
        //CetusSignerService,
        getCetusProvider(),
        getCetusAggregatorProvider(),
        getSuiClientProvider(),
        PoolManagerService,
        CetusSwapService,
        CetusSignerService
        //MixinService,
        //CetusSwapService,
        //AllocationManagerService,
        // PositionManagerService,
        //TickManagerService,
        //BalanceManagerService
    ],
})
export class CetusModule extends ConfigurableModuleClass {}
