import { Injectable } from "@nestjs/common"

@Injectable()
export class MixinService {
    constructor() { }
    public checkTokenAddress(tokenAddress1: string, tokenAddress2: string) {
        const suiAddresses = [
            "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI",
            "0x2::sui::SUI",
        ]
        if (
            suiAddresses.includes(tokenAddress1) &&
            suiAddresses.includes(tokenAddress2)
        ) {
            return true
        }
        return tokenAddress1 === tokenAddress2
    }
}