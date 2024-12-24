const db = require("../database/connection");
const { encrypt } = require("../utils/encryptFunctions");
const { getOpenSearchPassword } = require("../utils/envUtils");
require("../utils/envUtils");
const crypto = require('crypto');

const connectDatabase = async (callback) => {
  try {
    const collections = await db.connectToDatabase();

    return await callback(collections);
  } catch (error) {

  }
};

const fetchUniqueLogsFromOpenSearch = async () => {
  const username = process.env.OPENSEARCH_USER;
  const password = process.env.OPENSEARCH_NON_PROD_PASSWORD || await getOpenSearchPassword();
  const OPENSEARCH_URL = process.env.OPENSEARCH_URL;
  const applicationIndex = process.env.APPLICATION_INDEX;

  const requestURL = `${OPENSEARCH_URL}/${applicationIndex}/_search`;

  const requestBody = {
    size: 0,
    aggs: {
      unique_hosts: {
        terms: {
          field: "hostname.keyword",
          size: 10000
        },
        aggs: {
          latest_timestamp: {
            top_hits: {
              sort: [{ timestamp: { order: "desc" } }],
              size: 1
            }
          }
        }
      }
    }
  };

  const requestOptions = {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${username}:${password}`, "utf-8").toString("base64")}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  };

  try {
    const response = await fetch(requestURL, requestOptions);
    if (response.ok) {
      const data = await response.json();
      const uniqueLogs = data.aggregations.unique_hosts.buckets.map(bucket => bucket.latest_timestamp.hits.hits[0]._source);
      if (uniqueLogs.length) {
        insertOrUpdateHostsInDB(uniqueLogs);
      }
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error: ${error.message}`);
  }
};

const insertOrUpdateHostsInDB = async (data) => {
  connectDatabase(async (collections) => {
    const bulkUpdateOps = [];
    const bulkInsertOps = [];
    const existingHostnames = new Set();
    const now = new Date();

    for (const sourceObject of data) {
      const hostname = sourceObject.hostname.toUpperCase();
      sourceObject.hostname = hostname;
      sourceObject.status = "Active";
      sourceObject.updatedAt = now;
      sourceObject.createdAt = sourceObject.createdAt || now;

      existingHostnames.add(hostname);

      const existingRecord = await collections.cybersphere_servers.findOne({ hostname });

      if (existingRecord) {
        bulkUpdateOps.push({
          updateOne: {
            filter: { hostname },
            update: { $set: { status: "Active", updatedAt: now } }
          }
        });
      } else {
        bulkInsertOps.push({
          insertOne: {
            document: {
              hostname,
              status: "Active",
              createdAt: now,
              updatedAt: now
            }
          }
        });
      }
    }

    await collections.cybersphere_servers.updateMany(
      { hostname: { $nin: Array.from(existingHostnames) } },
      { $set: { status: "Inactive" } }
    );

    if (bulkUpdateOps.length) {
      await collections.cybersphere_servers.bulkWrite(bulkUpdateOps);
    }
    if (bulkInsertOps.length) {
      await collections.cybersphere_servers.bulkWrite(bulkInsertOps);
    }
  });
};

const syncCMDBData = async () => {


  try {
    await connectDatabase(async (collections) => {
      try {
        const serversToUpdate = await collections.cybersphere_servers.find().toArray();
        for (const agent of serversToUpdate) {
          try {
            const sapMasterData = await collections.sapMasterData.findOne({ ciOsVmHostname: agent.hostname });
            const cmdbUpdate = {};
            const fields = [
              'ciOsType', 'slRegion', 'slName', 'slPlatform', 'ciSapNameEnv',
              'ciSapNameSid', 'iamGroupName', 'ciSapAppId', 'ciSapName',
              'sapVirtualPkg', 'ciSapTaoGroup'
            ];
            fields.forEach(field => {
              if (field === 'ciSapNameEnv') {
                cmdbUpdate[`cmdb.${field}`] = sapMasterData ? sapMasterData['ciSapUsedFor'] ?? "" : "NOT_FOUND";
              } else {
                cmdbUpdate[`cmdb.${field}`] = sapMasterData ? sapMasterData[field] ?? "" : "NOT_FOUND";
              }
            });
            try {
              await collections.cybersphere_servers.updateOne(
                { hostname: agent.hostname },
                { $set: cmdbUpdate }
              );
            } catch (error) {
              console.error(`Failed to update cmdb for ${agent.hostname}:`, error);
            }

          } catch (error) {
            console.error(`Error processing agent ${agent.hostname}:`, error);
          }
        }
      } catch (error) {
        console.error('Error fetching servers to update:', error);
      }
    });
  } catch (error) {
    console.error('Error connecting to database:', error);
  }
};
const fetchLogsAndInsert = async () => {
  const username = process.env.OPENSEARCH_USER;
  const password = process.env.OPENSEARCH_NON_PROD_PASSWORD || await getOpenSearchPassword();
  const OPENSEARCH_URL = process.env.OPENSEARCH_URL;
  const applicationIndex = process.env.CLI_INDEX;

  const requestURL = `${OPENSEARCH_URL}/${applicationIndex}/_search`;
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const formattedDate = oneMonthAgo.toISOString();

  const requestBody = {
    size: 10000,
    query: {
      range: { timestamp: { gte: formattedDate, format: "strict_date_optional_time" } }
    },
    from: 0
  };

  const requestOptions = {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${username}:${password}`, "utf-8").toString("base64")}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  };

  let allLogs = [];
  let hasMoreLogs = true;
  let currentPage = 0;

  try {
    while (hasMoreLogs) {
      requestBody.from = currentPage * 10000;
      const response = await fetch(requestURL, requestOptions);
      if (response.ok) {
        const data = await response.json();
        const logs = data.hits.hits.map(hit => hit._source);
        if (logs.length) allLogs = allLogs.concat(logs);
        hasMoreLogs = logs.length === 10000;
        currentPage++;
      } else {
        hasMoreLogs = false;
      }
    }

    if (allLogs.length) {
      const decryptedLogs = await Promise.all(
        allLogs.map(async (log) => {
          const decryptedMessage = await decryptAES(log.message);
          return { ...log, message: decryptedMessage };
        })
      );
      const report = buildTop10Report(decryptedLogs);
      await insertMonthlyReport(report);
      await insertMonthlyLogs(decryptedLogs);
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error: ${error.message}`);
  }
};

const buildTop10Report = (logs) => {
  const stats = { hostname: {}, platform: {}, env: {}, ci: {}, command: {}, logged_in_user: {}, cr_number: {}, restricted_commands: {} };

  logs.forEach((log) => {
    const { hostname, platform, env, ci, message } = log;
    const parsedMessage = JSON.parse(message);
    stats.hostname[hostname] = (stats.hostname[hostname] || 0) + 1;
    stats.platform[platform] = (stats.platform[platform] || 0) + 1;
    stats.env[env] = (stats.env[env] || 0) + 1;
    stats.ci[ci] = (stats.ci[ci] || 0) + 1;
    const { command, logged_in_user, cr_number, denied } = parsedMessage;
    stats.command[command] = (stats.command[command] || 0) + 1;
    stats.logged_in_user[logged_in_user] = (stats.logged_in_user[logged_in_user] || 0) + 1;
    if (cr_number) stats.cr_number[cr_number] = (stats.cr_number[cr_number] || 0) + 1;
    if (denied) stats.restricted_commands[command] = (stats.restricted_commands[command] || 0) + 1;
  });

  const getTop10 = (data) =>
    Object.entries(data)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([key, value]) => ({ name: key, count: value }));

  return {
    topHostnames: getTop10(stats.hostname),
    topPlatforms: getTop10(stats.platform),
    topEnvs: getTop10(stats.env),
    topCIs: getTop10(stats.ci),
    topCommands: getTop10(stats.command),
    topUsers: getTop10(stats.logged_in_user),
    topChangeRequests: getTop10(stats.cr_number),
    topRestrictedCommands: getTop10(stats.restricted_commands),
  };
};

const insertMonthlyReport = async (report) => {
  await connectDatabase(async (collections) => {

    const now = new Date();
    const month = now.toLocaleString('default', { month: 'short' }).toLowerCase();
    report = await encrypt(report);

    const reportDocument = { reportDate: now.toISOString(), report };
    const existingReport = await collections.cybersphere_performance_metrics.findOne({ month });

    if (existingReport) {
      await collections.cybersphere_performance_metrics.updateOne(
        { month },
        { $set: { ...reportDocument } }
      );
    } else {
      await collections.cybersphere_performance_metrics.insertOne({
        month,
        ...reportDocument
      });
    }

    console.log(`Report for ${month} inserted into DB`);
  });
};

const decryptAES = async (data) => {
  const NONCE_LENGTH = 12;
  const TAG_LENGTH = 16;
  const ALGORITHM = "aes-256-gcm";
  const LOG_KEY = process.env.LOG_KEY ? process.env.LOG_KEY : await getOpenSearchLogKey();
  const key = Buffer.from(LOG_KEY);
  let encryptedData = Buffer.from(data, "base64");
  const nonce = encryptedData.subarray(0, NONCE_LENGTH);
  const authTag = encryptedData.subarray(encryptedData.length - TAG_LENGTH);
  encryptedData = encryptedData.subarray(
    NONCE_LENGTH,
    encryptedData.length - TAG_LENGTH,
  );
  const decipher = crypto.createDecipheriv(ALGORITHM, key, nonce);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedData, null, "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}


module.exports = {
  syncServerFromOpenSearch: fetchUniqueLogsFromOpenSearch,
  syncCMDBData: syncCMDBData,
  fetchLogsAndInsert: fetchLogsAndInsert,
};
