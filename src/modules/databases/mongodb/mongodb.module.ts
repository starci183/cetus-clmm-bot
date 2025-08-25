import { DynamicModule, Logger, Module } from "@nestjs/common"
import { MongooseModule as NestMongooseModule } from "@nestjs/mongoose"
import {
    LiquidityRangeSchema,
    LiquidityRangeSchemaClass,
    PairSchema,
    PairSchemaClass,
    ProfilePairSchema,
    ProfilePairSchemaClass,
    ProfileSchema,
    ProfileSchemaClass,
    TokenSchema,
    TokenSchemaClass,
} from "./schemas"
import { Connection } from "mongoose"
import { normalizeMongoose } from "./plugins"
import { envConfig } from "@/modules/env"
import {
    ConfigurableModuleClass,
    OPTIONS_TYPE,
} from "./mongodb.module-definition"

@Module({})
export class MongooseModule extends ConfigurableModuleClass {
    private static readonly logger = new Logger(MongooseModule.name)
    public static forRoot(options: typeof OPTIONS_TYPE = {}): DynamicModule {
        const dynamicModule = super.forRoot(options)
        const { dbName, host, password, port, username } =
      envConfig().databases.mongodb
        const url = `mongodb://${username}:${password}@${host}:${port}`
        return {
            ...dynamicModule,
            imports: [
                NestMongooseModule.forRoot(url, {
                    retryWrites: true,
                    retryReads: true,
                    authSource: "admin",
                    dbName,
                    autoCreate: true,
                    connectionFactory: async (connection: Connection) => {
                        connection.plugin(normalizeMongoose)
                        return connection
                    },
                }),
                this.forFeature(),
            ],
        }
    }

    private static forFeature(): DynamicModule {
        return {
            module: MongooseModule,
            imports: [
                NestMongooseModule.forFeatureAsync([
                    {
                        name: LiquidityRangeSchema.name,
                        useFactory: () => LiquidityRangeSchemaClass,
                    },
                    {
                        name: TokenSchema.name,
                        useFactory: () => TokenSchemaClass,
                    },
                    {
                        name: PairSchema.name,
                        useFactory: () => PairSchemaClass,
                    },
                    {
                        name: ProfilePairSchema.name,
                        useFactory: () => ProfilePairSchemaClass,
                    }, 
                    {
                        name: ProfileSchema.name,
                        useFactory: () => ProfileSchemaClass,
                    },
                ]),
            ],
        }
    }
}
