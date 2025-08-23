// profile is the json file you want to input into the database

import { AbstractSchema } from "./abstract"
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import {
    ProfilePairSchema,
    ProfilePairSchemaClass,
} from "./profile-pair.schema"
import {
    LiquidityRangeSchema,
    LiquidityRangeSchemaClass,
} from "./liquidity-range.schema"

// to keep earning
@Schema({
    timestamps: true,
    collection: "profiles",
    id: true,
})
export class ProfileSchema extends AbstractSchema {
    @Prop({ type: String, required: true })
        name: string

    @Prop({ type: String, required: true })
        description: string

    @Prop({ type: [ProfilePairSchemaClass] })
        profilePairs: Array<ProfilePairSchema>

    @Prop({ type: [LiquidityRangeSchemaClass] })
        liquidityRanges: Array<LiquidityRangeSchema>
}

export const ProfileSchemaClass = SchemaFactory.createForClass(ProfileSchema)