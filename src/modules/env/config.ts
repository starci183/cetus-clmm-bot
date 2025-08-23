
export const envConfig = () => ({
    pairs: {
        jsonEncodedData: process.env.PAIRS_JSON_ENCODED_DATA || "",
    },
    sui: {
        walletAddress: process.env.SUI_WALLET_ADDRESS || "",
        privateKey: {
            iv: process.env.SUI_PRIVATE_KEY_IV || "",
            key: process.env.SUI_PRIVATE_KEY_KEY || "",
            cipherText: process.env.SUI_PRIVATE_KEY_CIPHER_TEXT || "",
        }
    },
    redis: {
        host: process.env.REDIS_HOST || "",
        port: process.env.REDIS_PORT || "",
        password: process.env.REDIS_PASSWORD || "",
        ttl: Number(process.env.REDIS_TTL) || 60000,
    },
    databases: {
        mongodb: {
            host: process.env.MONGODB_HOST || "",
            port: process.env.MONGODB_PORT || "",
            username: process.env.MONGODB_USERNAME || "",
            password: process.env.MONGODB_PASSWORD || "",
            dbName: process.env.MONGODB_DB_NAME || "",
        }
    }
})
