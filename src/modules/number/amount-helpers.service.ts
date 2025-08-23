import { Injectable } from "@nestjs/common"
import { Decimal } from "decimal.js"
import BN from "bn.js"
import { TokenId } from "../common"
import { BaseHelpersService } from "./base-helpers.service"

@Injectable()
export class AmountHelpersService {
    constructor(private readonly baseHelpersService: BaseHelpersService) {}

    public toRaw(tokenId: TokenId, amount: number): BN {
        const decimals = this.baseHelpersService.getDecimals(tokenId)
        return new BN(
            new Decimal(amount).mul(new Decimal(10).pow(decimals)).toString(),
        )
    }
}
