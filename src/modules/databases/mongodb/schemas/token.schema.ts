import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import { AbstractSchema } from "./abstract"
import { TokenId } from "../../../common/types"

@Schema({
    timestamps: true,
    collection: "tokens"
})
export class TokenSchema extends AbstractSchema {
    @Prop({
        required: true,
        unique: true
    })
        displayId: TokenId

    @Prop({
        required: true,
    })
        name: string
    
    @Prop({
        required: true,
    })
        address: string

    @Prop({
        required: true,
    })
        decimals: number
}

export const TokenSchemaClass = SchemaFactory.createForClass(TokenSchema)