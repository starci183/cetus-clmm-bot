import { Provider } from "@nestjs/common"
import { Cache, createCache } from "cache-manager"
import { CACHE_MANAGER } from "./cache.constants"
import KeyvRedis from "@keyv/redis"
import { envConfig } from "../env"
import Keyv from "keyv"
import { createClient } from "redis"
export const createRedisCacheManagerFactoryProvider = (): Provider => ({
    provide: CACHE_MANAGER,
    useFactory: async (): Promise<Cache> => {
        const client = createClient({
            url: `redis://${envConfig().redis.host}:${envConfig().redis.port}`,
            password: envConfig().redis.password,
        })
        await client.connect()
        const keyv = new Keyv(
            new KeyvRedis(
                client
            ),
        )
        return createCache({
            stores: [keyv],
            ttl: envConfig().redis.ttl,
        })
    },
})
