const fetch = require("node-fetch");
const { getRustPassword, getOpenSearchPassword, getMasterAgentPassword } = require("../utils/envUtils");
const responseCodes = require("../utils/responseCodes");
const { default: axios } = require("axios");

require("dotenv").config();


const createFetchRequest = async (url, method, data = null) => {
  const username = process.env.RUST_API_USERNAME;
  const password = process.env.RUST_API_PASSWORD ? process.env.RUST_API_PASSWORD : await getRustPassword();
  const headers = {
    Authorization: `Basic ${Buffer.from(`${username}:${password}`, "utf-8").toString("base64")}`,
  };
  const requestOptions = {
    method,
    headers,
  };

  if (data) {
    headers["Content-Type"] = "application/json";
    requestOptions.body = JSON.stringify(data);
  }
  return fetch(url, requestOptions);
};

const createOpenSearchFetchRequest = async (url, method) => {
  const username = process.env.OPENSEARCH_USER;
  const password = process.env.OPENSEARCH_NON_PROD_PASSWORD ? process.env.OPENSEARCH_NON_PROD_PASSWORD : await getOpenSearchPassword();
  const OPENSEARCH_URL = process.env.OPENSEARCH_URL;
  const headers = {
    Authorization: `Basic ${Buffer.from(`${username}:${password}`, "utf-8").toString("base64")}`,
  };
  const requestOptions = {
    method,
    headers,
  };
  return fetch(OPENSEARCH_URL + url, requestOptions);
};

const createMasterAgentFetchRequest = async (url, method) => {
  const username = process.env.MASTERAGENT_USERNAME;
  const password = process.env.MASTERAGENT_PASSWORD ? process.env.MASTERAGENT_PASSWORD : await getMasterAgentPassword();
  const MASTERAGENT_URL = process.env.MASTERAGENT_URL;
  const headers = {
    Authorization: `Basic ${Buffer.from(`${username}:${password}`, "utf-8").toString("base64")}`,
  };
  const requestOptions = {
    method,
    headers,
  };

  return fetch(MASTERAGENT_URL + url, requestOptions);
};

const fetchData = async (url, method, data = null, isRustAgent = true, isMasterAgent = false, isDownloadApi = false) => {
  try {
    const response = isMasterAgent ? await createMasterAgentFetchRequest(url, method) : (isRustAgent ? await createFetchRequest(url, method, data) : await createOpenSearchFetchRequest(url, method));
    if (response.status === responseCodes.SUCCESS) {
      const contentType = response.headers.get('content-type');

      let jsonResponse = {};
      if (isDownloadApi) {
        jsonResponse = { type: "buffer", contentType: contentType, data: await response.buffer() };
      }
      else if (contentType.includes('application/json')) {
        jsonResponse = await response.json();
      }
      else {
        jsonResponse = { type: "unknown", contentType: contentType, data: await response.text() };
      }

      if (isRustAgent) {
        return jsonResponse;
      }
      else if (isMasterAgent) {
        const sortedAgentMetaDataResponse = jsonResponse.agentMetaDataResponse.sort((a, b) => Number(b.buildDate) - Number(a.buildDate));
        return { risebotVersions: sortedAgentMetaDataResponse };
      }
      else {
        return jsonResponse.hits.hits.map(record => record._source).filter(Boolean);
      }

    }
    else if (response.status === responseCodes.NOT_FOUND) {
      return { status: responseCodes.NOT_FOUND, message: "File not found" }
    }
  } catch (error) {
    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND" || error.message) {
      return undefined;
    }
  }

};

const getBaseURL = async host => {
  const hostname = host?.hostname;
  const DEFAULT_PORT = 20140;
  const port = host?.port !== undefined && host?.port !== "undefined" ? host.port : DEFAULT_PORT;
  return `https://${hostname}:${port}`;
};

const executeRustCommand = async (data) => {
  try {
    const port = 20101;
    const hostname = data?.hostname;
    const payload = {
      command: Buffer.from(data?.command).toString("base64"),
    };
    const username = process.env.RUST_API_USERNAME;
    const password = process.env.RUST_API_PASSWORD;
    const headers = {
      Authorization: `Basic ${Buffer.from(`${username}:${password}`, "utf-8").toString("base64")}`,
    };
    const agentRes = await axios.post(`https://${hostname}:${port}/agent/command/execute`, payload, { headers });
    console.log("agent response", agentRes)
    return agentRes;
  } catch (e) {
    console.log("agent error", e)
    return e;
  }
};



module.exports = {
  fetchData,
  getBaseURL,
  executeRustCommand,
  getHealth: async data => fetchData(`${(await getBaseURL(data))}/agent/status`, "GET"),
  downloadFile: async data => fetchData(`${(await getBaseURL(data))}/agent/download/file`, "POST", data, true, false, true),
  getPid: async data => fetchData(`${(await getBaseURL(data))}/agent/pid`, "GET"),
  getMetric: async data => fetchData(`${(await getBaseURL(data))}/agent/metric`, "GET"),
  getConfig: async data => fetchData(`${(await getBaseURL(data))}/agent/config`, "GET"),
  putShutDown: async data => fetchData(`${(await getBaseURL(data))}/agent/shutdown`, "PUT"),
  putRestartAgent: async data => fetchData(`${(await getBaseURL(data))}/agent/restart`, "PUT"),
  putStart: async data => fetchData(`${(await getBaseURL(data))}/agent/jobs/start`, "PUT"),
  putStop: async data => fetchData(`${(await getBaseURL(data))}/agent/jobs/stop`, "PUT"),
  putRestart: async data => fetchData(`${(await getBaseURL(data))}/agent/jobs/restart`, "PUT"),
  getJobs: async data => fetchData(`${(await getBaseURL(data))}/agent/jobs`, "GET"),
  getJobDetails: async data => fetchData(`${(await getBaseURL(data))}/agent/jobs?name=${data.scheduledJobId}`, "GET"),
  postJob: async data => fetchData(`${(await getBaseURL(data))}/agent/job`, "POST", data),
  updateJob: async data => fetchData(`${(await getBaseURL(data))}/agent/job`, "PUT", data),
  updateVersion: async data => fetchData(`${(await getBaseURL(data))}/agent/version`, "PUT", { "agentpath": data.agentpath, "version": data.version }),
  deleteJob: async data => fetchData(`${await getBaseURL(data)}/agent/job?script_name=${data.scheduledJobId}`, "delete", {}),
  updateLocalConfiguration: async data => fetchData(`${(await getBaseURL(data))}/agent/config`, "PUT", data.propertiesSchemas),
  getApplicationLogs: async data => fetchData(`/${process.env.OPENSEARCH_APPLICATION_INDEX}/_search?from=${data.skip}&size=${data.limit}&sort=timestamp:desc&q=hostname:${data.hostname}`, "POST", data, false),
  getJobLogs: async data => fetchData(`/${process.env.OPENSEARCH_APPLICATION_INDEX}/_search?from=${data.skip}&size=${data.limit}&sort=timestamp:desc&q=jobname:${data.jobname}`, "POST", data, false),
  getVersions: async data => fetchData(`/rust-agent/version-list?agentType=rustlinux`, "GET", data, false, true),
  downloadAgent: async data => fetchData(`${(await getBaseURL(data))}/agent/version`, "PUT"),
};
