const { getOpenSearchPassword } = require("../utils/envUtils");
const fetch = require("node-fetch");

require("dotenv").config();
const db = require("../database/connection");

const connectDatabase = async (callback) => {
  try {
    const collections = await db.connectToDatabase();
    return await callback(collections);
  } catch (error) {
    console.log(error, "connectDatabase");
  }
};
const fetchDataByTimeInterval = async (timeIntervalInMinutes) => {
  const username = process.env.OPENSEARCH_USER;
  const password = process.env.OPENSEARCH_NON_PROD_PASSWORD
    ? process.env.OPENSEARCH_NON_PROD_PASSWORD
    : await getOpenSearchPassword();
  const OPENSEARCH_URL = process.env.OPENSEARCH_URL;
  const healthIndex = process.env.OPENSEARCH_HEALTH_DISCOVERY_INDEX;

  // Calculate the timestamp based on the provided time interval
  const startTime = new Date(
    Date.now() - timeIntervalInMinutes * 60 * 1000
  ).toISOString();
  const currentTime = new Date().toISOString();

  const requestURL = `${OPENSEARCH_URL}/${healthIndex}/_search?sort=timestamp:desc&size=10000&q=timestamp:[${startTime} TO ${currentTime}]`;
  const requestOptions = {
    method: "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(
        `${username}:${password}`,
        "utf-8"
      ).toString("base64")}`,
    },
  };

  try {
    const response = await fetch(requestURL, requestOptions);
    if (response.ok) {
      const res = await response.json();
      return res.hits.hits;
    } else {
      return [];
    }
  } catch (error) {
    return [];
  }
};

const insertDataintoAgentInfoCollection = async () => {
  const username = process.env.OPENSEARCH_USER;
  const healthIndex = process.env.OPENSEARCH_HEALTH_DISCOVERY_INDEX;

  const password = process.env.OPENSEARCH_NON_PROD_PASSWORD
    ? process.env.OPENSEARCH_NON_PROD_PASSWORD
    : await getOpenSearchPassword();
  const OPENSEARCH_URL = process.env.OPENSEARCH_URL;
  const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
  const currentTime = new Date().toISOString();

  const requestURL = `${OPENSEARCH_URL}/${healthIndex}/_search?sort=timestamp:desc&size=10000&q=timestamp:[${sixMinutesAgo} TO ${currentTime}]`;
  const requestOptions = {
    method: "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(
        `${username}:${password}`,
        "utf-8"
      ).toString("base64")}`,
    },
  };

  try {
    const response = await fetch(requestURL, requestOptions);
    if (response.ok) {
      var res = await response.json();
      await insertintoDB(res.hits.hits);
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error occurred: ${error}`);
  }
};

const insertintoDB = async (data) =>
  connectDatabase(async (collections) => {
    const sourceObjects = data.map((item) => item._source);
    const uniqueHostnames = new Set(sourceObjects.map((item) => item.hostname));
    const uniqueSourceObjects = Array.from(uniqueHostnames).map((hostname) =>
      sourceObjects.find((item) => item.hostname === hostname)
    );

    const bulkUpdateOps = [];
    const bulkInsertOps = [];
    const existingHostnames = new Set();
    let inactiveCount = 0;
    let activeCount = 0;

    for (const sourceObject of uniqueSourceObjects) {
      const hostname = sourceObject.hostname.toUpperCase();

      sourceObject.hostname = hostname;
      sourceObject.agent_details.vm_hostname = hostname;
      sourceObject.status = "Active";
      sourceObject.os = sourceObject.agent_details.os_type;
      sourceObject.risebot = {
        agentId: sourceObject.agent_config.agent_id ?? "",
        pid: sourceObject.agent_details.pid ?? "",
      };
      sourceObject.risebotProperties = {
        agent: {
          version: sourceObject.agent_details.version,
        },
        server: {
          port: sourceObject.agent_details.server_port,
        },
      };
      const now = new Date();
      existingHostnames.add(hostname);
      const existingRecord = await collections.cybersphere_servers.findOne({
        hostname: hostname,
      });
      if (existingRecord) {
        sourceObject.updatedAt = now;
        bulkUpdateOps.push({
          updateOne: {
            filter: { hostname: hostname },
            update: { $set: sourceObject },
          },
        });
      } else {
        sourceObject.createdAt = now;
        sourceObject.updatedAt = now;
        bulkInsertOps.push({
          insertOne: {
            document: {
              hostname: hostname,
              ...sourceObject,
            },
          },
        });
      }
    }
    // First, update all existing records to "Inactive" except for those found in opensearch
    const { modifiedCount } = await collections.cybersphere_servers.updateMany(
      {
        hostname: { $nin: Array.from(existingHostnames) },
        status: { $ne: "Failed" },
      },
      { $set: { status: "Inactive" } }
    );
    inactiveCount += modifiedCount;
    if (bulkUpdateOps.length > 0) {
      const { modifiedCount: updateCount } = await collections.cybersphere_servers.bulkWrite(
        bulkUpdateOps
      );
      activeCount += updateCount;
    }
    if (bulkInsertOps.length > 0) {
      const { insertedCount } = await collections.cybersphere_servers.bulkWrite(
        bulkInsertOps
      );
      console.log(`Added ${insertedCount} new hosts`);
    }
    console.log(`Updated ${inactiveCount} hosts to 'Inactive'`);
    console.log(`Updated ${activeCount} hosts to 'Active'`);
  });

const updateFailedAgent = async () =>
  connectDatabase(async (collections) => {
    try {
      const twentyFourHoursData = await fetchDataByTimeInterval(24 * 60);
      const sourceObjects = twentyFourHoursData.map((item) => item._source);
      const existingHostnames = sourceObjects.map((sourceObject) =>
        sourceObject.hostname.toUpperCase()
      );

      const allAgents = await collections.cybersphere_servers.find({}).toArray();
      const allHostnames = allAgents.map((agent) => agent.hostname);

      const hostnamesNotFoundInLogs = allHostnames.filter(
        (hostname) => !existingHostnames.includes(hostname)
      );
      const bulkOps = hostnamesNotFoundInLogs.map((hostname) => ({
        updateOne: {
          filter: { hostname: hostname },
          update: { $set: { status: "Failed" } },
        },
      }));

      if (bulkOps.length > 0) {
        await collections.cybersphere_servers.bulkWrite(bulkOps);
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error occurred: ${error}`);
    }
  });
const updateCMDBData = async () =>
  connectDatabase(async (collections) => {
    const agentsToUpdate = await collections.cybersphere_servers
      .find({ status: { $ne: "Failed" } })
      .toArray();
    for (const agent of agentsToUpdate) {
      const sapMasterData = await collections.sapMasterData.findOne({
        ciOsVmHostname: agent.hostname,
      });
      if (sapMasterData) {
        await collections.cybersphere_servers.updateOne(
          { hostname: agent.hostname },
          {
            $set: {
              cmdb: {
                ciOsType: sapMasterData["ciOsType"] ?? "", //OS
                slRegion: sapMasterData["slRegion"] ?? "", //Region
                slName: sapMasterData["slName"] ?? "", //Service Name
                slPlatform: sapMasterData["slPlatform"] ?? "", //Platform
                ciSapNameEnv: sapMasterData["ciSapUsedFor"] ?? "", //Env
                ciSapNameSid: sapMasterData["ciSapNameSid"] ?? "", //SID
              },
            },
          }
        );
      }
    }
  });

module.exports = {
  connectDatabase,
  insertintoDB,
  fetchDataByTimeInterval,
  updateFailedAgent,
  syncAgentStatus: () => insertDataintoAgentInfoCollection(),
  updateFailedAgentStatus: () => updateFailedAgent(),
  syncDiscoveryData: () => updateCMDBData(),
};
