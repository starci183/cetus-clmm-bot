import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import { AbstractSchema } from "./abstract"
import { PairSchema } from "./pair.schema"
import { Schema as MongooseSchema, Types } from "mongoose"
import { TokenSchema } from "./token.schema"

@Schema({ timestamps: true, autoCreate: false, id: true })
export class ProfilePairSchema extends AbstractSchema {
  @Prop({
      type: MongooseSchema.Types.ObjectId,
      ref: PairSchema.name,
      index: true,
  })
      pair: PairSchema | Types.ObjectId
  @Prop({
      type: MongooseSchema.Types.ObjectId,
      ref: TokenSchema.name,
  })
      priorityToken: TokenSchema | Types.ObjectId

  @Prop({ type: Number, default: 0 })
      capitalAllocatedPercentage: number
}

export const ProfilePairSchemaClass =
  SchemaFactory.createForClass(ProfilePairSchema)
