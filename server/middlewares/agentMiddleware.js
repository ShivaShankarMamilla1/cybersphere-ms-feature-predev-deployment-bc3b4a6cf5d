const { getRustPassword } = require("../utils/envUtils");
const responseCodes = require("../utils/responseCodes");
const basicAuth = require('basic-auth');
/**
 * Middleware wrapper for OAuth token validation.
 */
module.exports.validate = async (req, res, next) => {
  if (process.env.NODE_ENV == 'local') {
    next();
  } else {
    next();
  }
};

module.exports.validatewithBasicAuth = async (req, res, next) => {
  const credentials = basicAuth(req);

  if (!credentials || !(await validateCredentials(credentials))) {
    res?.setHeader('WWW-Authenticate', 'Basic realm="Authorization Required"');
    return res.status(responseCodes.UNAUTHORIZED).send('Unauthorized');
  }

  next();
};


async function validateCredentials(credentials) {
  const validUsername = process.env.RUST_API_USERNAME;
  const validPassword = process.env.RUST_API_PASSWORD ? process.env.RUST_API_PASSWORD : await getRustPassword();
  return credentials.name === validUsername && credentials.pass === validPassword;
}
