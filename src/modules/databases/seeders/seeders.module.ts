import { Module } from "@nestjs/common"
import { ConfigurableModuleClass } from "./seeders.module-definition"
import { SeedersService } from "./seeders.service"

@Module({
    providers: [SeedersService],
})
export class SeedersModule extends ConfigurableModuleClass {
}