const jwt = require("jsonwebtoken");
const jwksClient = require("jwks-rsa");
const { loadConfig } = require('../utils/msalConfig.js');
const ROLES = require("../utils/roles");

let tokenValidationConfig;
let msalConfig;

let configPromise = getConfigs();

async function getConfigs() {
    const config = await loadConfig();
    msalConfig = config.msalConfig;
    tokenValidationConfig = config.tokenValidationConfig;
}

const getKey = async (header, callback) => {
    await configPromise;
    const client = jwksClient({
        jwksUri: `${msalConfig.auth.authority}/discovery/v2.0/keys`,
    });

    client.getSigningKey(header.kid, (err, key) => {
        if (err) {
            callback(err, null);
        } else {
            const signingKey = key.getPublicKey();
            callback(null, signingKey);
        }
    });
};

module.exports.validateOauthToken = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            statusCode: 401,
            message: 'No Token Found!',
        });
    }

    const token = authHeader.split(' ')[1];


    configPromise.then(() => {
        jwt.verify(token, getKey, {
            algorithms: ['RS256'], issuer: tokenValidationConfig.issuer, audience: tokenValidationConfig.audience
        }, async (err, decoded) => {
            if (err) {

                return res.status(401).json({
                    success: false,
                    statusCode: 401,
                    message: err?.message === 'jwt expired' ? "Session Expired" : err?.message,
                });

            } else {
                const MOCK_ROLE = process.env.MOCK_ROLE
                const mock_roles = MOCK_ROLE ? ROLES[MOCK_ROLE] : ""

                const userDetails = {
                    name: decoded?.name?.replace(/\s*\[.*?\]\s*/g, "").trim() ?? "",
                    email: decoded?.preferred_username ?? "",
                    userId: decoded?.oid ?? "",
                    username: decoded?.preferred_username.split("@")[0] ?? "",
                    roles: mock_roles !== "" ? [mock_roles] : (decoded?.roles ?? []),
                }
                req.user = userDetails;
                next();
            }
        });
    }).catch((err) => {
        return res.status(500).json({
            success: false,
            statusCode: 500,
            message: 'Configuration not loaded correctly',
        });
    });
};
