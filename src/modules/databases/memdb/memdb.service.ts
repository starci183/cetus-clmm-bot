import { Injectable, Logger, OnModuleInit } from "@nestjs/common"
import { InjectMongoose, PairSchema, TokenSchema } from "../mongodb"
import { Connection } from "mongoose"
import { RetryService } from "../../mixin"
import { Cron, CronExpression } from "@nestjs/schedule"

@Injectable()
export class MemDbService implements OnModuleInit {
    private readonly logger = new Logger(MemDbService.name)
    public tokens: Array<TokenSchema> = []
    public pairs: Array<PairSchema> = []
    constructor(
        private readonly retryService: RetryService,
        @InjectMongoose()
        private readonly connection: Connection,
    ) { }

    private async loadAll() {
        await Promise.all([
            (async () => {
                const tokens = await this.connection
                    .model<TokenSchema>(TokenSchema.name)
                    .find()
                this.tokens = tokens
            })(),
            (async () => {
                const pairs = await this.connection
                    .model<PairSchema>(PairSchema.name)
                    .find()
                this.pairs = pairs
            })(),
        ])
    }

    onModuleInit() {
        this.logger.verbose("Loading all data from memdb...")
        this.retryService.retry({
            action: async () => {
                await this.loadAll()
            },
        })
        this.logger.log("Loaded all data from memdb")
    }

    @Cron(CronExpression.EVERY_30_SECONDS)
    async handleUpdate() {
        this.logger.verbose("Updating memdb...")
        await this.loadAll()
        this.logger.log("Updated memdb")
    }
}
