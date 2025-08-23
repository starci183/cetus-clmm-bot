import { Injectable } from "@nestjs/common"
import { MemDbService, TokenId } from "../databases"

@Injectable()
export class BaseHelpersService {
    constructor(private readonly memDbService: MemDbService) {}

    public getDecimals(tokenId: TokenId) {
        return (
            this.memDbService.tokens.find((token) => token.displayId === tokenId)
                ?.decimals || 9
        )
    }
}