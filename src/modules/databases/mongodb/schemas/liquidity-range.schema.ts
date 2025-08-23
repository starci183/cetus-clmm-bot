import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import { AbstractSchema } from "./abstract"
import { Schema as MongooseSchema } from "mongoose"
import { ProfilePairSchema } from "./profile-pair.schema"

// range mean [-1%, +1%] from the first liquidity provide
// to the current tick, we will move the positions over this range
@Schema({
    timestamps: true,
    collection: "liquidity_ranges",
})
export class LiquidityRangeSchema extends AbstractSchema {
    // the lower bound of the range
    @Prop({
        required: true,
    })
        tickIndexBoundLower: number

    // the current tick at the creation of the range
    @Prop({
        required: true,
    })
        currentTickAtCreation: number

    // the upper bound of the range
    @Prop({
        required: true,
    })
        tickIndexBoundUpper: number

    // the profile pair that this range belongs to
    @Prop({ type: MongooseSchema.Types.ObjectId, ref: ProfilePairSchema.name })
        profilePair: ProfilePairSchema

    // original capital
    @Prop({ type: Number, default: 0 })
        originalCapital: number

    // final capital
    @Prop({ type: Number, default: 0 })
        finalCapital: number

    // time duration of the range
    @Prop({ type: Number, default: 0 })
        timeDuration: number
}

export const LiquidityRangeSchemaClass =
    SchemaFactory.createForClass(LiquidityRangeSchema)
