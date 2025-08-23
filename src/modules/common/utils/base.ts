import { v4 } from "uuid"
import { Types } from "mongoose"

export const createObjectId = (id: string = v4()): Types.ObjectId => {
    let hex = Buffer.from(id, "utf-8").toString("hex")
    if (hex.length < 24) {
        hex = hex.padStart(24, "0")
    } else if (hex.length > 24) {
        hex = hex.slice(0, 24)
    }
    return new Types.ObjectId(hex)
}