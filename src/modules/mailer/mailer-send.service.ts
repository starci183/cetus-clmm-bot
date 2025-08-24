import { Injectable } from "@nestjs/common"
import { MailerService } from "@nestjs-modules/mailer"
import { LiquidityRangeSchema } from "../databases"
import { envConfig } from "../env"

@Injectable()
export class MailerSendService {
    constructor(
        private readonly mailerService: MailerService
    ) {}

    public sendAddLiquidityMail(
        digest: string,
        liquidityRange: LiquidityRangeSchema
    ) {
        this.mailerService.sendMail({
            to: envConfig().smtp.user,
            subject: "Add Liquidity Success ✅",
            template: "add-liquidity",
            context: {
                digest,
                liquidityRange,
                date: new Date().toLocaleString(),
            },
        })
    }
}