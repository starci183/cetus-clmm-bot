import { DynamicModule, Module } from "@nestjs/common"
import { ConfigurableModuleClass, OPTIONS_TYPE } from "./cache.module-definition"
import { createRedisCacheManagerFactoryProvider } from "./cache.providers"

@Module({})
export class CacheModule extends ConfigurableModuleClass {
    static register(options: typeof OPTIONS_TYPE = {}): DynamicModule {
        const dynamicModule = super.register(options)
        const providers = [createRedisCacheManagerFactoryProvider()]
        return {
            ...dynamicModule,
            providers: [...(dynamicModule.providers || []), ...providers],
            exports: [...providers]
        }
    }
}
