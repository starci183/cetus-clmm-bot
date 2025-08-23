import { Module } from "@nestjs/common"
import { ConfigurableModuleClass } from "./number.module-definition"
import { AmountHelpersService } from "./amount-helpers.service"
import { BaseHelpersService } from "./base-helpers.service"

@Module({
    providers: [AmountHelpersService, BaseHelpersService],
    exports: [AmountHelpersService, BaseHelpersService],
})
export class NumberModule extends ConfigurableModuleClass {}