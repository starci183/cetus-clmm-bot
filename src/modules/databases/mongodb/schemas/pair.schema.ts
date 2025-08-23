import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import { AbstractSchema } from "./abstract"
import { PairId } from "../../../common/types"
import { TokenSchema } from "./token.schema"
import { Schema as MongooseSchema, Types } from "mongoose"

@Schema({
    timestamps: true,
    collection: "pairs",
})
export class PairSchema extends AbstractSchema {
    @Prop({
        required: true,
        unique: true
    })
        displayId: PairId

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: TokenSchema.name })
        tokenA: TokenSchema | Types.ObjectId

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: TokenSchema.name })
        tokenB: TokenSchema | Types.ObjectId

    @Prop({
        required: true,
    })
        feeRate: number
}
export const PairSchemaClass = SchemaFactory.createForClass(PairSchema)
