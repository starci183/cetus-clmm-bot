
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
    }
})
