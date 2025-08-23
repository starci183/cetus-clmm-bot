import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import { AbstractSchema } from "./abstract"
import { Schema as MongooseSchema, Types } from "mongoose"
import { ProfilePairSchema } from "./profile-pair.schema"

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
        profilePair: ProfilePairSchema | Types.ObjectId

    // original capital
    @Prop({ type: Number, default: 0 })
        originalCapital: number

    // final capital
    @Prop({ type: Number, default: 0 })
        finalCapital: number
}

export const LiquidityRangeSchemaClass =
    SchemaFactory.createForClass(LiquidityRangeSchema)
