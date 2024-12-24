//Import dependences
require("dotenv").config();
const { getParam } = require("./ssm.js");
const { APP_CONFIG } = require('../../config/index.js');

const getRustPassword = async () => {
  const res = await getParam(process.env.AGENT_API_PASSWORD);
  return res.Parameter.Value;
};

const getServiceNowPassword = async () => {
  const res = await getParam(process.env.SERVICENOW_PASSWORD);
  return res.Parameter.Value;
};
const getOpenSearchPassword = async () => {
  const res = await getParam(process.env.OPENSEARCH_PASSWORD);
  return res.Parameter.Value;
};

const getMasterAgentPassword = async () => {
  const res = await getParam(APP_CONFIG.MASTERAGENT_PASSWORD);
  return res.Parameter.Value;
};


const getServiceAccountPassword = async () => {
  const res = await getParam(APP_CONFIG.SERVICE_ACCOUNT_PASSWORD);
  return res.Parameter.Value;
};

const getMongoConnectionURL = async () => {
  const res = await getParam(process.env.MONGO_CONNECTION_URL);
  return res.Parameter.Value;
};
const getMongoPem = async () => {
  const res = await getParam(process.env.MONGO_TLS_PEM_FILE);
  return res?.Parameter?.Value;
};
const getOpenSearchLogKey = async () => {
  const res = await getParam(process.env.CLI_LOG_KEY);
  return res.Parameter.Value;
};
const getAWSKey = async () => {
  const res = await getParam(process.env.AWS_S3_ACCESS_KEY_ID);
  return res.Parameter.Value;
};
const getAWSSecreet = async () => {
  const res = await getParam(process.env.AWS_S3_SECRET_ACCESS_KEY);
  return res.Parameter.Value;
};
const getMSALClientID = async () => {
  const res = await getParam(process.env.MSAL_CLIENT_ID);
  return res.Parameter.Value;
};
const getMSALTenantID = async () => {

  const res = await getParam(process.env.MSAL_TENANT_ID);
  return res.Parameter.Value;
};

module.exports = {
  getMongoPem, getMongoConnectionURL,
  getRustPassword,
  getOpenSearchPassword,
  getServiceAccountPassword,
  getMasterAgentPassword,
  getServiceNowPassword,
  getOpenSearchLogKey,
  getAWSKey,
  getAWSSecreet,
  getMSALClientID,
  getMSALTenantID
};
