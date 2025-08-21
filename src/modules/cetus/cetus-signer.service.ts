import { Injectable, Logger, OnModuleInit } from "@nestjs/common"
import { envConfig } from "../env/config"
import * as crypto from "crypto"
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519"

@Injectable()
export class CetusSignerService implements OnModuleInit {
    private readonly logger = new Logger(CetusSignerService.name)
    private signer: Ed25519Keypair

    constructor() {}

    onModuleInit() {
        this.signer = this.getSigner()
        this.logger.debug(`Signer: ${this.signer.getPublicKey().toSuiAddress()}`)
    }

    // method to get the signer
    private getSigner() {
        const cipherText = envConfig().sui.privateKey.cipherText
        const iv = Buffer.from(envConfig().sui.privateKey.iv, "base64")
        const key = Buffer.from(envConfig().sui.privateKey.key, "utf8")
        const cipherBuffer = Buffer.from(cipherText, "base64")
        const authTag = cipherBuffer.subarray(cipherBuffer.length - 16)  // last 16 bytes
        const encrypted = cipherBuffer.subarray(0, cipherBuffer.length - 16)
        const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)
        decipher.setAuthTag(authTag)
        const privateKey = Buffer.concat([
            decipher.update(encrypted),
            decipher.final(),
        ]).toString("utf8")
        return Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, "hex"))
    }
}
