import { Injectable, Logger } from "@nestjs/common"
import { Seeder } from "nestjs-seeder"
import { Connection } from "mongoose"
import { InjectMongoose } from "../../mongodb"
import { TokenSchema } from "../../mongodb/schemas"
import { createObjectId } from "@/modules/common"
import { TokenId } from "../../../common/types"

@Injectable()
export class TokenSeeder implements Seeder {
    private readonly logger = new Logger(TokenSeeder.name)

    constructor(
        @InjectMongoose()
        private readonly connection: Connection
    ) { }

    public async seed(): Promise<void> {
        this.logger.debug("Seeding tokens...")
        await this.drop()
        const data: Array<Partial<TokenSchema>> = [
            {
                _id: createObjectId(TokenId.Usdc),
                name: "USDC",
                displayId: TokenId.Usdc,
                address: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
                decimals: 6,
            },
            {
                _id: createObjectId(TokenId.Ika),
                name: "IKA",
                displayId: TokenId.Ika,
                address: "0x7262fb2f7a3a14c888c438a3cd9b912469a58cf60f367352c46584262e8299aa::ika::IKA",
                decimals: 9,
            },
            {
                _id: createObjectId(TokenId.Sui),
                name: "SUI",
                displayId: TokenId.Sui,
                address: "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI",
                decimals: 9,
            },
            {
                _id: createObjectId(TokenId.Walrus),
                name: "WALRUS",
                displayId: TokenId.Walrus,
                address: "0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL",
                decimals: 9,
            },
            {
                _id: createObjectId(TokenId.Cetus),
                name: "CETUS",
                displayId: TokenId.Cetus,
                address: "0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS",
                decimals: 9,
            },
        ]
        try {
            await this.connection.model<TokenSchema>(TokenSchema.name).create(data)
        } catch
        //(error) 
        {
            //console.error(error)
        }
    }


    async drop(): Promise<void> {
        this.logger.verbose("Dropping tokens...")
        await this.connection.model<TokenSchema>(TokenSchema.name).deleteMany({})
    }
}