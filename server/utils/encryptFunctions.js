const crypto = require('crypto');

// eslint-disable-next-line no-undef

const PASSPHRASE = process.env.PASSPHRASE;
const IV_LENGTH = 16;

const STATIC_IV = Buffer.alloc(IV_LENGTH, 0);

const encrypt = async (text) => {
    try {
        const ENCRYPTION_KEY = crypto.createHash('sha256').update(PASSPHRASE).digest();
        const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, STATIC_IV);
        let encrypted = cipher.update(text?.toString(), 'utf8', 'hex');
        encrypted += cipher.final('hex');

        return encrypted;

    } catch (e) {
        console.error("Error in encryption", e);
    }
};

const decrypt = async (encryptedText) => {
    try {
        if (encryptedText) {
            const ENCRYPTION_KEY = crypto.createHash('sha256').update(PASSPHRASE).digest();

            const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, STATIC_IV);

            let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
            decrypted += decipher.final('utf8');

            return decrypted;
        } else {
            return "";
        }
    } catch (e) {
        console.error("Error in decryption", e);
    }
};

module.exports = {
    encrypt,
    decrypt
};