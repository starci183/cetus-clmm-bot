import { DynamicModule, Module } from "@nestjs/common"
import { ConfigurableModuleClass, OPTIONS_TYPE } from "./mailer.module-definition"
import { MailerModule as NestMailerModule } from "@nestjs-modules/mailer"
import { PugAdapter } from "@nestjs-modules/mailer/dist/adapters/pug.adapter"
import { envConfig } from "../env"

@Module({})
export class MailerService extends ConfigurableModuleClass {
    static register(options: typeof OPTIONS_TYPE): DynamicModule {
        const dynamicModule = super.register(options)
        const module = NestMailerModule.forRoot({
            transport: {
                host: process.env.SMTP_HOST,
                port: Number(process.env.SMTP_PORT),
                secure: false,
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS,
                },
            },
            defaults: {
                from: `"${envConfig().smtp.name}" <${envConfig().smtp.user}>`,
            },
            template: {
                dir: envConfig() + "/templates",
                adapter: new PugAdapter(),
                options: {
                    strict: true,
                },
            },
        })
        return {
            ...dynamicModule,
            imports: [
                module
            ],
            exports: [
                module
            ]
        }
    }
}    