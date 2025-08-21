import { Module } from "@nestjs/common"
import { EnvModule } from "@/modules/env"
import { ScheduleModule } from "@nestjs/schedule"
import { EventEmitterModule } from "@nestjs/event-emitter"
import { CetusModule } from "./modules/cetus/cetus.module"

@Module({
    imports: [
        EnvModule.forRoot(),
        ScheduleModule.forRoot(),
        EventEmitterModule.forRoot(),
        CetusModule.register({})  
    ],
})
export class AppModule { }
