import { Injectable, Logger } from "@nestjs/common"
import { Seeder } from "nestjs-seeder"
import { Connection } from "mongoose"
import { InjectMongoose } from "../../mongodb/mongodb.decorators"
import { PairSchema } from "../../mongodb/schemas"
import { createObjectId } from "@/modules/common"
import { PairId, TokenId } from "../../../common/types"

@Injectable()
export class PairSeeder implements Seeder {
    private readonly logger = new Logger(PairSeeder.name)

    constructor(
    @InjectMongoose()
    private readonly connection: Connection,
    ) {}

    public async seed(): Promise<void> {
        this.logger.debug("Seeding pairs...")
        const data: Array<Partial<PairSchema>> = [
            {
                _id: createObjectId(PairId.SuiIka02),
                displayId: PairId.SuiIka02,
                tokenA: createObjectId(TokenId.Ika),
                tokenB: createObjectId(TokenId.Sui),
                feeRate: 0.002,
            },
            {
                _id: createObjectId(PairId.SuiUsdc05),
                displayId: PairId.SuiUsdc05,
                tokenA: createObjectId(TokenId.Sui),
                tokenB: createObjectId(TokenId.Usdc),
                feeRate: 0.005,
            },
        ]
        try {
            await this.connection.model<PairSchema>(PairSchema.name).create(data)
            this.logger.verbose("Pairs seeded successfully")
        } catch {
            //(error)
            //this.logger.error(error)
        }
    }

    async drop(): Promise<void> {
        this.logger.verbose("Dropping pairs...")
        await this.connection.model<PairSchema>(PairSchema.name).deleteMany({})
    }
}
