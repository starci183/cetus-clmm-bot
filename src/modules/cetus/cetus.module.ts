import { Module } from "@nestjs/common"
import { PoolManagerService } from "./pool-manager.service"
import { PositionManagerService } from "./position-manager.service"
import { CetusSignerService } from "./cetus-signer.service"
import { getCetusProvider } from "./cetus.providers"
import { ConfigurableModuleClass } from "./cetus.module-definition"
import { MixinService } from "./mixin.service"
import { AllocationManagerService } from "./allocation-manager.service"
import { TickManagerService } from "./tick-manager.service"
import { BalanceManagerService } from "./balance-manager.service"
@Module({
    providers: [
        CetusSignerService,
        getCetusProvider(),
        PoolManagerService,
        MixinService,
        AllocationManagerService,
        PositionManagerService,
        TickManagerService,
        BalanceManagerService
    ],
})
export class CetusModule extends ConfigurableModuleClass {}
