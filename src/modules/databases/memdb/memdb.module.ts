import { Module } from "@nestjs/common"
import { ConfigurableModuleClass } from "./memdb.module-definition"
import { MemDbService } from "./memdb.service"

@Module({
    providers: [MemDbService],
    exports: [MemDbService],
})
export class MemDbModule extends ConfigurableModuleClass {}