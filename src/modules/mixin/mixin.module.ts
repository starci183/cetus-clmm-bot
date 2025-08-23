import { Module } from "@nestjs/common"
import { ConfigurableModuleClass } from "./mixin.module-definition"
import { RetryService } from "./retry.service"

@Module({
    providers: [RetryService],
    exports: [RetryService],
})
export class MixinModule extends ConfigurableModuleClass {}