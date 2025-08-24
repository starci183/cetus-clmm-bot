import { Injectable, Logger, OnModuleInit } from "@nestjs/common"
import {
    InjectMongoose,
    PairSchema,
    ProfilePairSchema,
    ProfileSchema,
    TokenSchema,
} from "../mongodb"
import { Connection } from "mongoose"
import { RetryService } from "../../mixin"
import { Cron, CronExpression } from "@nestjs/schedule"
import _ from "lodash"

@Injectable()
export class MemDbService implements OnModuleInit {
    private readonly logger = new Logger(MemDbService.name)
    public tokens: Array<TokenSchema> = []
    public pairs: Array<PairSchema> = []
    public profiles: Array<ProfileSchema> = []
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
                this.tokens = tokens.map(token => token.toJSON())
            })(),
            (async () => {
                const pairs = await this.connection
                    .model<PairSchema>(PairSchema.name)
                    .find()
                    .populate("tokenA")
                    .populate("tokenB")
                this.pairs = pairs.map(pair => pair.toJSON())
            })(),
            (async () => {
                const profiles = await this.connection
                    .model<ProfileSchema>(ProfileSchema.name)
                    .find()
                this.profiles = profiles.map(profile => profile.toJSON())
            })(),
        ])
    }

    async onModuleInit() {
        this.logger.verbose("Loading all data from memdb...")
        await this.retryService.retry({
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

    public populateProfilePair(
        profile: ProfileSchema
    ) {
        const clonedProfile = _.cloneDeep(profile)
        for (const profilePair of clonedProfile.profilePairs) {
            const pair = this.pairs.find(
                (pair) => pair.id.toString() === profilePair.pair.toString()
            )
            if (!pair) {
                throw new Error(`Pair not found for ${profilePair.pair}`)
            }
            profilePair.pair = pair
            profilePair.priorityToken = (profilePair.priorityToken.toString() === pair.tokenA.id.toString()) ? pair.tokenA : pair.tokenB
        }
        return clonedProfile
    }

    public priorityAOverB(
        profilePair: ProfilePairSchema
    ) {
        const pair = profilePair.pair as PairSchema
        const tokenA = pair.tokenA as TokenSchema
        if (profilePair.priorityToken.id === tokenA.id) {
            return true
        }
        return false
    }
}
