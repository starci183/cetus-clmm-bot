import { Injectable, Logger } from "@nestjs/common"
import { Seeder } from "nestjs-seeder"
import { Connection } from "mongoose"
import { ProfileSchema, InjectMongoose } from "../../mongodb"
import { createObjectId, DeepPartial, PairId, TokenId } from "@/modules/common"

export const PROFILE_DEFAULT = "profile-default"

@Injectable()
export class ProfileSeeder implements Seeder {
    private readonly logger = new Logger(ProfileSeeder.name)

    constructor(
    @InjectMongoose()
    private readonly connection: Connection,
    ) {}

    public async seed(): Promise<void> {
        this.logger.debug("Seeding profiles...")
        await this.drop()
        const data: Array<DeepPartial<ProfileSchema>> = [
            {
                _id: createObjectId(PROFILE_DEFAULT),
                name: "Default",
                description: "Default profile for everyone to farm SUI",
                profilePairs: [
                    {
                        pair: createObjectId(PairId.SuiIka02),
                        priorityToken: createObjectId(TokenId.Sui),
                        capitalAllocatedMax: 100,       
                    },
                ],
                liquidityRanges: []
            },
        ]
        try {
            await this.connection.model<ProfileSchema>(ProfileSchema.name).create(data)
            this.logger.verbose("Pairs seeded successfully")
        } catch {
            //(error)
            //this.logger.error(error)
        }
    }

    async drop(): Promise<void> {
        this.logger.verbose("Dropping profiles...")
        await this.connection.model<ProfileSchema>(ProfileSchema.name).deleteMany({})
    }
}
