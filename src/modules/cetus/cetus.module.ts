import { Module } from "@nestjs/common"
import { PoolManagerService } from "./pool-manager.service"
import { PositionManagerService } from "./position-manager.service"
import { CetusSignerService } from "./cetus-signer.service"
import { getCetusProvider } from "./cetus.providers"
import { ConfigurableModuleClass } from "./cetus.module-definition"

@Module({
    providers: [
        CetusSignerService,
        getCetusProvider(),
        PoolManagerService,
        PositionManagerService,
    ],
})
export class CetusModule extends ConfigurableModuleClass {}
