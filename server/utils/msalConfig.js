const { getMSALClientID,getMSALTenantID } = require("./envUtils");
async function loadConfig() {
    const clientId = process.env.CLIENT_ID || await getMSALClientID(); 
    const tenantId = process.env.TENANT_ID || await getMSALTenantID(); 

    const msalConfig = {
        auth: {
            clientId,
            authority: `https://login.microsoftonline.com/${tenantId}`,
        },
        system: {
            loggerOptions: {
                loggerCallback(message) {
                    console.log(message);
                },
                piiLoggingEnabled: false,
                logLevel: "Verbose",
            },
        },
    };

    const tokenValidationConfig = {
        issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
        audience: clientId,
    };

    return { msalConfig, tokenValidationConfig };
}

module.exports = { loadConfig };
