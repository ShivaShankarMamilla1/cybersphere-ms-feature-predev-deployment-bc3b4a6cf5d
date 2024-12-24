const db = require("../database/connection");
const responseCodes = require("../utils/responseCodes");
const APIMessages = require("../utils/messages");
const Joi = require("joi");
const { ObjectId } = require("mongodb");
const { decrypt, encrypt } = require("../utils/encryptFunctions");
const { getOpenSearchPassword, getOpenSearchLogKey } = require("../utils/envUtils");
const crypto = require('crypto');
const { config } = require("process");
const { objectIdValidator } = require("../utils/commonFunctions");
const connectDatabase = async (callback) => {
  try {
    const collections = await db.connectToDatabase();
    return await callback(collections);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error occurred: ${error}`);
  }
};


const getMonitoringMetrics = async (req, res) => {
  try {
    const reqbody = req.method === "GET" ? req.query : req.body;
    const { startDate, endDate } = reqbody;

    const schema = Joi.object({
      startDate: Joi.date().required(),
      endDate: Joi.date().required(),
    });

    const validation = schema.validate({ startDate, endDate });
    if (validation.error) {
      return res.status(400).json({
        flag: "error",
        error: validation.error.message.replace(/"([^"]+)"/, (_, p1) =>
          p1
            .replace(/([a-z])([A-Z])/g, "$1 $2")
            .replace(/^\w/, (c) => c.toUpperCase())
        ),
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    if (start > end) {
      return res.status(401).json({
        flag: "error",
        message: "Start date cannot be later than end date.",
      });
    }

    const openSearchBody = {
      size: 0,
      aggs: {
        unique_hostnames: {
          cardinality: {
            field: "hostname.keyword",
          },
        },
        command_executed_successfully_count: {
          filter: {
            term: {
              "message.message.keyword": "Command executed successfully",
            },
          },
        },
        total_records: {
          value_count: {
            field: "_id",
          },
        },
        not_command_executed_count: {
          filter: {
            bool: {
              must_not: {
                term: {
                  "message.message.keyword": "Command executed successfully",
                },
              },
            },
          },
        },
        unique_usernames: {
          cardinality: {
            field: "message.logged_in_user.keyword",
          },
        },
        top_hostnames: {
          terms: { field: "hostname.keyword", size: 10 },
        },
        top_users: {
          terms: { field: "message.logged_in_user.keyword", size: 10 },
        },
        top_commands: {
          terms: { field: "message.command.keyword", size: 10 },
        },
        command_types: {
          terms: { field: "message.message.keyword", size: 10 },
        },
      },
    };

    const username = process.env.OPENSEARCH_USER;
    const password = process.env.OPENSEARCH_NON_PROD_PASSWORD
      ? process.env.OPENSEARCH_NON_PROD_PASSWORD
      : await getOpenSearchPassword();
    const OPENSEARCH_URL = process.env.OPENSEARCH_URL;
    const CLI_INDEX = process.env.CLI_INDEX;

    const requestURL = `${OPENSEARCH_URL}/${CLI_INDEX}/_search`;
    const openSearchResponse = await fetch(requestURL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(
          `${username}:${password}`,
          "utf-8"
        ).toString("base64")}`,
      },
      body: JSON.stringify(openSearchBody),
    });

    if (!openSearchResponse.ok) {
      throw new Error(
        `OpenSearch request failed with status ${openSearchResponse.status}`
      );
    }

    const openSearchData = await openSearchResponse.json();

    let commandsData = [];
    let commandsName = [];

    let usernames = [];
    let userFrequency = [];

    let commands = [];
    let commandCounts = [];

    const {
      aggregations: {
        top_hostnames,
        top_users,
        top_commands,
        command_types,
        unique_hostnames,
        unique_usernames,
        command_executed_successfully_count,
        not_command_executed_count,
        total_records,
      },
    } = openSearchData;
    const error_percentage = (
      (not_command_executed_count.doc_count / total_records.value) *
      100
    ).toFixed(2);
    console.log(
      not_command_executed_count,
      total_records,
      error_percentage,
      "total_records"
    );
    top_commands.buckets.map(
      (bucket) => (
        commandsData?.push(bucket.doc_count), commandsName?.push(bucket.key)
      )
    );
    top_users.buckets.map(
      (bucket) => (
        usernames?.push(bucket.key), userFrequency?.push(bucket.doc_count)
      )
    );
    command_types.buckets.map(
      (bucket) => (
        commands?.push(bucket.key), commandCounts?.push(bucket.doc_count)
      )
    );

    const counts = {
      TotalHostNamesCount: unique_hostnames?.value,
      TotalUsersCount: unique_usernames?.value,
      TotalCommandsExecutedCount:
        command_executed_successfully_count?.doc_count,
      TotalErrorsPercentage: error_percentage,
    };

    const metrics = {
      TopHostNames: top_hostnames.buckets.map((bucket) => ({
        _id: bucket.key,
        total: bucket.doc_count,
      })),
      TopUsers: {
        userFrequency: userFrequency,
        usernames: usernames,
      },
      TopCommands: {
        data: commandsData,
        categories: commandsName,
      },
      Commands: {
        commands: commands,
        commandCounts: commandCounts,
      },
    };

    res.status(200).json({
      flag: "success",
      message: "Data fetched successfully",
      data: { counts, metrics },
    });
  } catch (error) {
    console.error(error, "error occured");
    res.status(500).json({
      flag: "error",
      error: error.message,
      message: "Internal server error",
    });
  }
};

const getCliAuditLogs = async (req, res) => {
  try {
    const reqbody = req.method === "GET" ? req.query : req.body;
    const limit = parseInt(reqbody.pageSize) || 10;
    const pageNo = parseInt(reqbody.pageNo) || 1;
    const from = (pageNo - 1) * limit;
    let { startDate, endDate } = reqbody;

    const username = process.env.OPENSEARCH_USER;
    const password = process.env.OPENSEARCH_NON_PROD_PASSWORD
      ? process.env.OPENSEARCH_NON_PROD_PASSWORD
      : await getOpenSearchPassword();
    const OPENSEARCH_URL = process.env.OPENSEARCH_URL;
    const CLI_INDEX = process.env.CLI_INDEX;

    const hostname = reqbody.hostname?.replace(/"/g, "");
    const sid = reqbody.sid?.replace(/"/g, "");
    const env = reqbody.env?.replace(/"/g, "");

    const queryParts = [];

    if (hostname) {
      queryParts.push({ match: { hostname } });
    }
    if (sid) {
      queryParts.push({ match: { sid } });
    }
    if (env) {
      queryParts.push({ match: { env } });
    }

    if (startDate || endDate) {
      startDate = new Date(startDate);
      endDate = new Date(endDate);
      const rangeFilter = {
        range: {
          timestamp: {
            ...(startDate && { gte: startDate }),
            ...(endDate && { lte: endDate }),
          },
        },
      };
      queryParts.push(rangeFilter);
    }

    const requestBody = {
      from,
      size: limit,
      sort: [{ timestamp: { order: "desc" } }],
      query: {
        bool: {
          must: [
            ...queryParts,
            { match: { level: "INFO" } }
          ],
        },
      },
    };

    const requestOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(
          `${username}:${password}`,
          "utf-8"
        ).toString("base64")}`,
      },
      body: JSON.stringify(requestBody),
    };

    const response = await fetch(`${OPENSEARCH_URL}/${CLI_INDEX}/_search`, requestOptions);

    if (!response.ok) {
      return res.status(response.status).json({
        flag: "error",
        message: `Failed to fetch data from OpenSearch: ${response.statusText}`,
      });
    }

    const result = await response.json();

    const pagination = {
      total: result?.hits?.total?.value || 0,
      limit,
      pageNo,
      totalPage: Math.ceil((result?.hits?.total?.value || 0) / limit),
    };

    const data = result.hits?.hits || [];
    const decryptedData = await Promise.all(
      data.map(async (item) => {
        const decryptedMessage = await decryptAES(item._source.message);
        let parsedMessage;
        try {
          parsedMessage = JSON.parse(decryptedMessage);
        } catch (e) {
          console.error("Failed to parse decrypted message:", e);
          parsedMessage = decryptedMessage;
        }

        return {
          ...item,
          _source: {
            ...item._source,
            message: parsedMessage,
          },
        };
      })
    );

    res.status(200).json({
      flag: "success",
      message: "Data fetched successfully",
      pagination,
      data: decryptedData,
    });
  } catch (error) {
    console.error(
      `[${new Date().toISOString()}] Error occurred: ${error.message}`
    );
    res.status(500).json({
      flag: "error",
      message: "Server error occurred while fetching data.",
      error: error.message,
    });
  }
};

const getUniqueValue = async (req, res) => {
  try {
    const username = process.env.OPENSEARCH_USER;
    const password = process.env.OPENSEARCH_NON_PROD_PASSWORD
      ? process.env.OPENSEARCH_NON_PROD_PASSWORD
      : await getOpenSearchPassword();
    const OPENSEARCH_URL = process.env.OPENSEARCH_URL;
    const CLI_INDEX = process.env.CLI_INDEX;

    const requestBody = {
      size: 0,
      aggs: {
        unique_hostnames: {
          terms: {
            field: "hostname.keyword",
            size: 10000,
          },
        },
        unique_ci: {
          terms: {
            field: "ci.keyword",
            size: 10000,
          },
        },
        unique_platforms: {
          terms: {
            field: "platform.keyword",
            size: 10000,
          },
        },
        unique_regions: {
          terms: {
            field: "region.keyword",
            size: 10000,
          },
        },
        unique_envs: {
          terms: {
            field: "env.keyword",
            size: 10000,
          },
        },
        unique_sids: {
          terms: {
            field: "sid.keyword",
            size: 10000,
          },
        },
      },
    };

    const requestOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(
          `${username}:${password}`
        ).toString("base64")}`,
      },
      body: JSON.stringify(requestBody),
    };

    const response = await fetch(`${OPENSEARCH_URL}/${CLI_INDEX}/_search`, requestOptions);

    if (!response.ok) {
      return res.status(response.status).json({
        flag: "error",
        message: `Failed to fetch data from OpenSearch: ${response.statusText}`,
      });
    }

    const result = await response.json();
    const getUniqueKeys = (buckets) => buckets.map((bucket) => bucket.key).filter((key) => key !== '');

    const uniqueHostnames = getUniqueKeys(result.aggregations.unique_hostnames.buckets);
    const uniqueEnvs = getUniqueKeys(result.aggregations.unique_envs.buckets);
    const uniqueCIs = getUniqueKeys(result.aggregations.unique_ci.buckets);
    const uniquePlatforms = getUniqueKeys(result.aggregations.unique_platforms.buckets);
    const uniqueRegions = getUniqueKeys(result.aggregations.unique_regions.buckets);
    const uniqueSids = getUniqueKeys(result.aggregations.unique_sids.buckets);

    // Send the response
    res.status(200).json({
      flag: "success",
      message: "Data fetched successfully",
      hostnames: uniqueHostnames,
      envs: uniqueEnvs,
      sids: uniqueSids,
      cis: uniqueCIs,
      platforms: uniquePlatforms,
      regions: uniqueRegions,
    });
  } catch (error) {
    console.error(
      `[${new Date().toISOString()}] Error occurred: ${error.message}`
    );
    res.status(500).json({
      flag: "error",
      message: "Server error occurred while fetching data.",
      error: error.message,
    });
  }
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
const traceConfig = async (req, res) => {
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;
      const { hostname, uniqueTraceId, username, sessionId, } = reqbody

      const configReqBodyValidation = Joi.object({
        hostname: Joi.string(),
        username: Joi.string(),
        uniqueTraceId: Joi.string(),
        sessionId: Joi.string(),
      });

      const validationBody = { hostname, username, uniqueTraceId, sessionId };

      const validationResult = configReqBodyValidation.validate(validationBody);

      if (validationResult.error) {
        return res.status(responseCodes.SUCCESS).json({
          flag: "error",
          error: validationResult.error?.message.replace(
            /"([^"]+)"/,
            (match, p1) => {
              return p1
                .replace(/([a-z])([A-Z])/g, "$1 $2")
                .replace(/^\w/, (c) => c.toUpperCase());
            }
          ),
        });
      }
      let configDetails;
      const falseValue = false;
      const cmdbDetails = await collections.cybersphere_servers.findOne({ hostname: hostname }, { projection: { cmdb: 1, hostname: 1 } });
      const env = cmdbDetails?.cmdb?.ciSapNameEnv;
      const platform = cmdbDetails?.cmdb?.slPlatform;
      const region = cmdbDetails?.cmdb?.slRegion;
      const sid = cmdbDetails?.cmdb?.ciSapNameSid;
      let FilterSearch = {
        isDeleted: await encrypt(falseValue)
      }
      const limit = parseInt(reqbody.pageSize) || 10;
      const pageNo = parseInt(reqbody.pageNo - 1) || 0;
      const skip = pageNo * limit;

      const sortFilter = { date: -1 };
      // Fetch matching logs

      if (hostname && username) {
        const encrypthostname = await encrypt(hostname?.trim())
        const encryptuser = await encrypt(username?.toLowerCase().trim())
        const encryptUniqueTraceId = await encrypt(uniqueTraceId?.trim())
        const encryptSessionId = await encrypt(sessionId?.trim())

        FilterSearch['username'] = encryptuser
        FilterSearch['hostname'] = encrypthostname
        FilterSearch['uniqueTraceId'] = encryptUniqueTraceId
        FilterSearch['sessionId'] = encryptSessionId
        configDetails = await collections.trace_configs.findOne(FilterSearch).skip(skip)
          .limit(limit)
          .sort(sortFilter)
          .toArray();;
      }
      else {
        configDetails = await collections.trace_configs
          .find(FilterSearch)
          .skip(skip)
          .limit(limit)
          .sort(sortFilter)
          .toArray();
      }

      if (configDetails) {

        for (let traceconfig of configDetails) {

          traceconfig.username = traceconfig?.username ? await decrypt(traceconfig.username) : "";
          traceconfig.hostname = traceconfig?.hostname ? await decrypt(traceconfig.hostname) : "";
          traceconfig.startDateTime = traceconfig?.startDateTime ? await decrypt(traceconfig.startDateTime) : "";
          traceconfig.expectedEndDateTime = traceconfig?.expectedEndDateTime ? await decrypt(traceconfig.expectedEndDateTime) : "";
          traceconfig.uniqueTraceId = traceconfig?.uniqueTraceId ? await decrypt(traceconfig.uniqueTraceId) : "";
          traceconfig.sessionId = traceconfig?.sessionId ? await decrypt(traceconfig.sessionId) : "";
          traceconfig.maxTime = traceconfig?.maxTime
            ? `${parseInt(await decrypt(traceconfig.maxTime))} ${parseInt(await decrypt(traceconfig.maxTime)) > 1 ? 'seconds' : 'second'}`
            : '0 second';
          traceconfig.traceEnabled = traceconfig?.traceEnabled ? parseInt(await decrypt(traceconfig.traceEnabled)) : 1;
          traceconfig.date = traceconfig?.date ? traceconfig.date : "";
          traceconfig.env = traceconfig?.env ? await decrypt(traceconfig.env) : env;
          traceconfig.platform = traceconfig?.platform ? await decrypt(traceconfig.platform) : platform;
          traceconfig.region = traceconfig?.region ? await decrypt(traceconfig.region) : region;
          traceconfig.sid = traceconfig?.sid ? await decrypt(traceconfig.sid) : sid;
          traceconfig.isDeleted = traceconfig?.isDeleted ? await decrypt(traceconfig.isDeleted) : "";

        }
      }
      else {
        configDetails.maxTime = 0 + 'second';
        configDetails.traceEnabled = 1;
        configDetails.env = env;
        configDetails.platform = platform;
        configDetails.region = region;
        configDetails.sid = sid;

      }
      const totalCount = await collections.trace_configs.countDocuments(
        FilterSearch
      );
      const totalPage = limit > 0 ? Math.ceil(totalCount / limit) : 1;
      const pagination = {
        limit: limit || totalCount, // If no limit, return total count
        pageNo: limit > 0 ? pageNo + 1 : 1,
        rowCount: configDetails?.length || 0,
        totalPage: isNaN(totalPage) ? 1 : totalPage,
        totalCount,
      };

      res.status(responseCodes.SUCCESS).json({
        flag: "success",
        message: APIMessages.SUCCESS,
        pagination,
        data: configDetails ?? {},
      });

    }
    catch (error) {
      res.status(responseCodes.SERVER_ERROR).json({
        flag: "error",
        error: error.message,
        message: APIMessages.SERVER_ERROR,
      });
    }
  })
}
const addTraceConfig = async (req, res) => {
  connectDatabase(async (collections) => {
    try {
      const { hostname, username, date, maxTime, groupId } = req.method === "GET" ? req.query : req.body;
      const cmdbDetails = await collections.cybersphere_servers.find({ hostname }).toArray();
      const { ciSapNameEnv: environment, slPlatform: platform, slRegion: region, ciSapNameSid: systemId } = cmdbDetails[0]?.cmdb || {};

      const traceConfig = {
        username: await encrypt(username.toLowerCase()),
        uniqueTraceId: null,
        hostname: await encrypt(hostname),
        sessionId: null,
        maxTime: await encrypt(maxTime),
        traceEnabled: 1,
        date: new Date(date),
        environment: await encrypt(environment),
        platform: await encrypt(platform),
        region: await encrypt(region),
        systemId: await encrypt(systemId),
        isDeleted: await encrypt(false),
      };

      if (groupId) {
        const existingTraceConfig = await collections.trace_configs.findOne({ hostname: traceConfig.hostname, username: traceConfig.username, uniqueTraceId: null, sessionId: null });

        if (existingTraceConfig) {
          return res.status(responseCodes.ERROR).json({ flag: "error", error: "Trace is already configured for this server and user" });
        }

        await collections.trace_configs.updateOne({ _id: ObjectId(groupId) }, { $set: traceConfig });
        return res.status(responseCodes.SUCCESS).json({ success: true, statusCode: responseCodes.SUCCESS, message: "Trace Config updated successfully" });
      }


      const existingTraceConfigs = await collections.trace_configs.find({ hostname: traceConfig.hostname, username: traceConfig.username, uniqueTraceId: null, sessionId: null }).toArray();
      for (const config of existingTraceConfigs) {
        if (await decrypt(config.isDeleted) === "false") {
          return res.status(responseCodes.ERROR).json({ flag: "error", error: "Trace is already configured for this server and user" });
        }
      }

      await collections.trace_configs.insertOne(traceConfig);
      return res.status(responseCodes.SUCCESS).json({ success: true, statusCode: responseCodes.SUCCESS, message: "Trace is now configured for the server. Please activate it from the server." });

    } catch (error) {
      res.status(responseCodes.SERVER_ERROR).json({ flag: "error", error: error.message, message: APIMessages.SERVER_ERROR });
    }
  });
};

const getTraceLogs = async (req, res) => {
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;
      const limit = parseInt(reqbody.pageSize) || 10;
      const pageNo = parseInt(reqbody.pageNo - 1) || 0;
      const uniqueTraceId = reqbody.uniqueTraceId || null;
      const skip = pageNo * limit;
      let searchFilter = {};
      const sortFilter = { date: -1 };

      if (uniqueTraceId) {
        searchFilter = { uniqueTraceId: await encrypt(uniqueTraceId) };
      }
      const resultSet = await collections.trace_logs
        .find(searchFilter)
        .skip(skip)
        .limit(limit)
        .sort(sortFilter)
        .toArray();

      let logs = [];

      for (const log of resultSet) {
        const decryptedFields = [
          "uniqueTraceId", "hostname", "ci", "env", "platform",
          "region", "level", "sid", "timestamp", "message"
        ];

        for (const field of decryptedFields) {
          log[field] = await decrypt(log[field]);
        }

        try {
          let msg = await decrypt(log.message);

          let parsedMessage = JSON.parse(msg);
          parsedMessage.forEach(entry => {
            if (entry.args && typeof entry.args === 'string') {
              entry.args = entry.args.replace(/\/\//g, '');

              try {
                entry.args = JSON.parse(entry.args);
              } catch (error) {
              }
            }
          });
          log.message = parsedMessage.map(({ level, args }) => ({ level, args }));


        } catch (error) {
          console.error("Error parsing log.message:", error);
          log.message = "Invalid message format";
        }

        logs.push(log);
      }

      const totalCount = await collections.trace_logs.countDocuments(searchFilter);
      const totalPage = Math.ceil(totalCount / limit);

      const pagination = {
        limit,
        pageNo: pageNo + 1,
        rowCount: resultSet?.length || 0,
        totalPage: isNaN(totalPage) ? 1 : totalPage,
        totalCount,
      };

      return res.status(responseCodes.SUCCESS).json({
        flag: "success",
        message: APIMessages.SUCCESS,
        pagination,
        data: logs ?? {},
      });
    } catch (error) {
      console.error("Error in fetchTraceLogs:", error);
      res.status(responseCodes.SERVER_ERROR).json({
        flag: "error",
        error: error.message,
        message: APIMessages.SERVER_ERROR,
      });
    }
  });
};
module.exports = {
  connectDatabase,
  getMonitoringMetrics: (req, res) => getMonitoringMetrics(req, res),
  getCliAuditLogs: (req, res) => getCliAuditLogs(req, res),
  getUniqueValue: (req, res) => getUniqueValue(req, res),
  getTraceLogs: (req, res) => getTraceLogs(req, res),
  addTraceConfig: (req, res) => addTraceConfig(req, res),
  traceConfig: (req, res) => traceConfig(req, res),
};
