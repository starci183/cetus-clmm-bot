
import { Prop } from "@nestjs/mongoose"
import { Document } from "mongoose"

export abstract class AbstractSchema extends Document {
    // define when the object was created
    @Prop()
        createdAt: Date

    // define when the object was updated
    @Prop()
        updatedAt: Date
}