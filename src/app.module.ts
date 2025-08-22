import { Module } from "@nestjs/common"
import { EnvModule } from "@/modules/env"
import { ScheduleModule } from "@nestjs/schedule"
import { EventEmitterModule } from "@nestjs/event-emitter"
import { CetusModule } from "./modules/cetus"
import { CacheModule } from "./modules/cache"

@Module({
    imports: [
        EnvModule.forRoot(),
        CacheModule.register({
            isGlobal: true,
        }),
        ScheduleModule.forRoot(),
        EventEmitterModule.forRoot(),
        CetusModule.register({
            isGlobal: true,
        })  
    ],
})
export class AppModule { }
