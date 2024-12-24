//ssm.js
"use strict";
const AWS = require("aws-sdk");
/**
 *AWS update.
 */
AWS.config.update({
  region: process.env.AWS_REGION,
});
const parameterStore = new AWS.SSM();

/**
 * Get details of Parameter
 * @param {*} name
 * @returns
 */
const getParameter = async name => {
try
{
  if (process.env.NODE_ENV == "local") {
    return {
      Parameter: {
        Name: "StripeSecretKey",
        Type: "SecureString",
        Value: "myVal",
        Version: 1,
        LastModifiedDate: 1530018761.888,
        ARN: "arn:aws:ssm:us-east-1:123456789012:parameter/helloSecureWorld",
      },
    };
  }
  return parameterStore
    .getParameter({ Name: name, WithDecryption: true })
    .promise();
}
catch(error)
{
  console.error(`[${new Date().toISOString()}] Error occurred: ${error.message}`);

}
 
};
const getParam = async paramName => getParameter(paramName);
module.exports = { getParam };
