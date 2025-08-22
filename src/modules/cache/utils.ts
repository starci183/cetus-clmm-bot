import { createHash } from "crypto"

export const createCacheKey = (...args: Array<unknown>): string => {
    const raw = args.map((a) => 
        typeof a === "object" ? JSON.stringify(a) : String(a)
    ).join(":")
    return createHash("sha256").update(raw).digest("hex")
}
