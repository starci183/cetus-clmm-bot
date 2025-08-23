import { InjectConnection } from "@nestjs/mongoose"

// InjectMongoose function to inject the mongoose connection based on options
export const InjectMongoose = () => InjectConnection()