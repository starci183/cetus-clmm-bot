import { Injectable, OnModuleInit } from "@nestjs/common"
import { Cache } from "cache-manager"
import { InjectCache } from "./cache-decorators.service"
import { envConfig } from "../env"

@Injectable()
export class CacheDebugService implements OnModuleInit {
    constructor(
        @InjectCache()
        private readonly cacheManager: Cache,
    ) { }

    async onModuleInit() {
        await this.cacheManager.set("foo", "bar", 1000)
        console.log(`redis://${envConfig().redis.host}:${envConfig().redis.port}`)
        const foo = await this.cacheManager.get("foo")
        console.log(foo)
    }
}