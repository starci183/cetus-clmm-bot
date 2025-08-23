import { Module } from "@nestjs/common"
import { EnvModule } from "@/modules/env"
import { ScheduleModule } from "@nestjs/schedule"
import { EventEmitterModule } from "@nestjs/event-emitter"
import { CetusModule } from "./modules/cetus"
import { CacheModule } from "./modules/cache"
import { MemDbModule, MongooseModule, SeedersModule } from "./modules/databases"
import { MixinModule } from "./modules/mixin"

@Module({
    imports: [
        EnvModule.forRoot(),
        MixinModule.register({
            isGlobal: true,
        }),
        CacheModule.register({
            isGlobal: true,
        }),
        MemDbModule.register({
            isGlobal: true,
        }),
        MongooseModule.forRoot(),
        ScheduleModule.forRoot(),
        EventEmitterModule.forRoot(),
        SeedersModule.register({
            isGlobal: true,
        }),
        CetusModule.register({
            isGlobal: true,
        })  
    ],
})
export class AppModule { }
