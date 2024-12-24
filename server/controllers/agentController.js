/* eslint-disable no-unused-vars */
/* eslint-disable no-const-assign */
const {
  getHealth,
  downloadFile,
  getJobs,
  getPid,
  updateVersion,
  getConfig,
  putStart,
  putStop,
  putRestart,
  putShutDown,
  putRestartAgent,
  postJob,
  deleteJob,
  getJobDetails,
  getApplicationLogs,
  getJobLogs,
  updateJob,
  updateLocalConfiguration,
  getVersions,
  downloadAgent,
  executeRustCommand,
} = require("../services/agentService");
const responseCodes = require("../utils/responseCodes");
const { getServiceAccountPassword } = require("../utils/envUtils");
const cronJobController = require("../cron/agentInfo");
const { ObjectId } = require("mongodb");
const Joi = require("joi");
const APIMessages = require("../utils/messages");
const {
  objectIdValidator,
  generateReqNumber,
} = require("../utils/commonFunctions");
const { sendApprovalEmail } = require("../utils/mailer");
const { Client } = require("ssh2");
require("dotenv").config();

const db = require("../database/connection");
const { encrypt, decrypt } = require("../utils/encryptFunctions");
const { deleteadGroup } = require("./manageAccess/ADGroup");

const connectDatabase = async (callback) => {
  try {
    const collections = await db.connectToDatabase();
    return await callback(collections);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error occurred: ${error}`);
  }
};

// Common function to handle API responses
async function handleCreateLogFun(collections, data) {
  try {
    const {
      username,
      module,
      actionType,
      ip,
      prevValue,
      changes,
      updatedValue,
      command,
      hostname,
      fieldChanged,
    } = data;

    const logObj = {
      username: await encrypt(username),
      module: await encrypt(module),
      actionType: await encrypt(actionType),
      ip: await encrypt(ip),
      hostname: await encrypt(hostname),
    };

    if (module?.toString().toLowerCase() === "cli") {
      await collections.cli_audit_logs.insertOne({
        ...logObj,
        command: (await encrypt(command)) || "",
        date: new Date(),
      });
    } else {
      await collections.audit_logs.insertOne({
        ...logObj,
        prevValue: prevValue || null,
        changes: changes || null,
        updatedValue: updatedValue || null,
        fieldChanged: fieldChanged || null,
        date: new Date(),
      });
    }
    return true;
  } catch (error) {
    console.error("Error in handleCreateLogFun:", error);
    return false;
  }
}

const handleApiResponse = async (req, res, apiFunction) =>
  connectDatabase(async (collections) => {
    try {

      let port = 20101;

      req.body = { ...req.body, port: port };

      let requestData = {};
      requestData = { ...req.query, ...req.body };
      const data = await apiFunction(requestData);

      if (data === undefined) {
        res.status(responseCodes.SUCCESS).json({
          flag: "error",
          error: "Unable to connect to server " + req.body.hostname,
          data: {},
        });
      } else if (data.status === responseCodes.NOT_FOUND) {
        res
          .status(responseCodes.NOT_FOUND)
          .json({ flag: "error", error: "File Not found" });
      } else if (data.status === responseCodes.SERVER_ERROR) {
        res
          .status(responseCodes.SERVER_ERROR)
          .json({ flag: "error", error: "Unable to connect to server" });
      } else {
        if (data.type === "buffer") {
          res.set("Content-Type", data.contentType);
          res.status(responseCodes.SUCCESS).send(data.data);
        } else {
          res.status(responseCodes.SUCCESS).json({ flag: "success", data });
        }
      }
    } catch (error) {
      res
        .status(responseCodes.SERVER_ERROR)
        .json({ flag: "error", error: error.message });
    }
  });
const startAgentService = async (req, res) => {
  const SERVICE_ACCOUNT_USERNAME = process.env.RISE_SA_USERNAME;
  const SERVICE_ACCOUNT_PASSWORD = process.env.RISE_SA_PASSWORD
    ? process.env.RISE_SA_PASSWORD
    : await getServiceAccountPassword();

  const sshConfig = {
    username: SERVICE_ACCOUNT_USERNAME,
    password: SERVICE_ACCOUNT_PASSWORD,
    host: req.hostname,
    port: 22,
    readyTimeout: 60000,
  };
  const osVersion = req.osVersion ?? "7.10";
  const client = new Client();

  try {
    await new Promise((resolve, reject) => {
      client.on("error", reject);
      client.on("ready", resolve);
      client.connect(sshConfig);
    });

    client.exec(
      osVersion.includes("6.")
        ? "sudo service risebot start"
        : "sudo systemctl start risebot",
      (err, stream) => {
        if (err) {
          res
            .status(responseCodes.SERVER_ERROR)
            .json({ flag: "error", error: err.message });
          return;
        }

        let commandOutput = "";
        stream.on("data", (data) => {
          commandOutput += data.toString();
        });

        stream.on("close", (code) => {
          if (code !== 0) {
            res
              .status(responseCodes.SERVER_ERROR)
              .json({ flag: "error", error: `Non-zero exit code: ${code}` });
          } else {
            res.status(responseCodes.SUCCESS).json({
              flag: "success",
              data: { message: "started", output: commandOutput },
            });
          }
          client.end();
        });
      }
    );
  } catch (error) {
    res
      .status(responseCodes.SERVER_ERROR)
      .json({ flag: "error", error: error.message });
  }
};

const getAgentInfo = async (req, res) =>
  connectDatabase(async (collections) => {
    let hostName = req.body.hostname;
    const result = await collections.cybersphere_servers.findOne({
      hostname: hostName,
    });
    const bytesToMB = (bytes) => (bytes / (1024 * 1024)).toFixed(2);

    if (!result) {
      res
        .status(responseCodes.NOT_FOUND)
        .json({ flag: "error", message: "Host Not found", data: {} });
    } else {
      result.agent_details.cpu_usage =
        typeof result.agent_details.cpu_usage !== "string"
          ? `${parseFloat(result.agent_details.cpu_usage).toFixed(3)}%`
          : result.agent_details.cpu_usage;
      result.agent_details.memory =
        typeof result.agent_details.memory !== "string"
          ? `${bytesToMB(result.agent_details.memory)} MB`
          : result.agent_details.memory;
      result.agent_details.disk_usage =
        typeof result.agent_details.disk_usage !== "string"
          ? `${bytesToMB(result.agent_details.disk_usage)} MB`
          : result.agent_details.disk_usage;

      res.status(responseCodes.SUCCESS).json({ flag: "success", data: result });
    }
  });

const getAgentsData = async (req, res) =>
  connectDatabase(async (collections) => {
    const reqbody = req.method === "GET" ? req.query : req.body;
    const limit = parseInt(reqbody.pageSize) || 100;
    const pageNo = parseInt(reqbody.pageNo) || 0;
    const skip = pageNo * limit;

    const query = buildQuery(reqbody);
    const resultSet = await collections.cybersphere_servers
      .find(query)
      .skip(skip)
      .limit(limit)
      .sort({ hostname: 1 })
      .toArray();

    const totalCount = await collections.cybersphere_servers.countDocuments(
      query
    );

    let activeCount = 0;
    let inactiveCount = 0;
    let failedCount = 0;

    const { status, ...filteredQuery } = query;
    activeCount = await collections.cybersphere_servers.countDocuments({
      status: "Active",
      ...filteredQuery,
    });
    inactiveCount = await collections.cybersphere_servers.countDocuments({
      status: "Inactive",
      ...filteredQuery,
    });
    failedCount = await collections.cybersphere_servers.countDocuments({
      status: "Failed",
      ...filteredQuery,
    });

    const result = {
      pagination: {
        limit,
        pageNo,
        totalPage: totalCount,
        activeCount,
        failedCount,
        inactiveCount,
        allCount: activeCount + inactiveCount + failedCount,
        totalRows: resultSet,
        status: status,
      },
    };

    res.status(responseCodes.SUCCESS).json({ flag: "success", data: result });
  });

const buildQuery = (reqbody) => {
  const query = {};

  // Add filters for status, search, hostnameArr
  if (reqbody.status && reqbody.status !== "Recent") {
    query.status = reqbody.status;
  }
  if (reqbody.search && reqbody.search.trim() !== "") {
    query.hostname = { $regex: new RegExp(reqbody.search, "i") };
  }
  if (reqbody.hostnameArr && reqbody.hostnameArr.trim() !== "") {
    const hostnames = reqbody.hostnameArr
      .split(",")
      .map((hostname) => hostname.trim());
    query.hostname = { $in: hostnames };
  }

  // Add filters for osTypes, regions, environments, platforms, sids, serviceNames
  const filterFields = [
    "osTypes",
    "regions",
    "environments",
    "platforms",
    "sids",
    "serviceNames",
  ];
  filterFields.forEach((field) => addFilter(reqbody, query, field, "cmdb"));

  // Add filter for agentVersions
  addFilter(reqbody, query, "agentVersions", "agent_details");

  return query;
};

const addFilter = (reqbody, query, field, prefix) => {
  if (reqbody[field] && reqbody[field].trim() !== "") {
    const values = reqbody[field].split(",").map((value) => value.trim());
    query[`${prefix}.${getFieldName(field)}`] = { $in: values };
  }
};

const getFieldName = (field) => {
  if (field === "osTypes") return "ciOsType";
  if (field === "regions") return "slRegion";
  if (field === "environments") return "ciSapNameEnv";
  if (field === "platforms") return "slPlatform";
  if (field === "sids") return "ciSapNameSid";
  if (field === "serviceNames") return "slName";
  if (field === "agentVersions") return "version";
};

const getMetricsData = async (req, res) =>
  connectDatabase(async (collections) => {
    const resultSet = await collections.cybersphere_servers.find().toArray();
    const activeCount = resultSet.filter(
      (agent) => agent.status === "Active"
    ).length;
    const inactiveCount = resultSet.filter(
      (agent) => agent.status === "Inactive"
    ).length;
    const failedCount = resultSet.filter(
      (agent) => agent.status === "Failed"
    ).length;
    let result = [
      {
        name: "Active",
        count: activeCount,
      },
      {
        name: "Inactive",
        count: inactiveCount,
      },
      {
        name: "Failed",
        count: failedCount,
      },
    ];

    res.status(responseCodes.SUCCESS).json({ flag: "success", data: result });
  });

const syncAgentStatus = async (req, res) => {
  cronJobController.syncAgentStatus();
  cronJobController.syncDiscoveryData();
  res
    .status(responseCodes.SUCCESS)
    .json({ flag: "success", message: "Agent Status Synced" });
};
const syncCMDBData = async (req, res) => {
  cronJobController.syncDiscoveryData();
  res
    .status(responseCodes.SUCCESS)
    .json({ flag: "success", message: "Agent CMDB Synced" });
};
const getDistinctValues = async (field, res, successKey, responseKey) => {
  try {
    await connectDatabase(async (collections) => {
      const values = await collections.cybersphere_servers.distinct(
        `cmdb.${field}`
      );
      const responseObject = { flag: "success" };
      responseObject[responseKey] = { [successKey]: values };
      res.status(responseCodes.SUCCESS).json(responseObject);
    });
  } catch (error) {
    res
      .status(responseCodes.SERVER_ERROR)
      .json({ flag: "error", message: "Internal server error" });
  }
};

const getRegions = async (req, res) => {
  await getDistinctValues("slRegion", res, "regions", "agentRegions");
};

const getPlatforms = async (req, res) => {
  await getDistinctValues("slPlatform", res, "platforms", "agentPlatforms");
};

const getEnvironments = async (req, res) => {
  await getDistinctValues(
    "ciSapNameEnv",
    res,
    "environments",
    "agentEnvironments"
  );
};

const getSids = async (req, res) => {
  await getDistinctValues("ciSapNameSid", res, "sids", "agentSids");
};

const getOStypes = async (req, res) => {
  await getDistinctValues("ciOsType", res, "os", "agentOsTypes");
};

const getServiceNames = async (req, res) => {
  await getDistinctValues("slName", res, "serviceNames", "agentServiceNames");
};

const getAgentVersions = async (req, res) => {
  try {
    await connectDatabase(async (collections) => {
      const values = await collections.cybersphere_servers.distinct(
        `agent_details.version`
      );
      const responseObject = { flag: "success" };
      responseObject["agentVersions"] = { ["versions"]: values };
      res.status(responseCodes.SUCCESS).json(responseObject);
    });
  } catch (error) {
    res
      .status(responseCodes.SERVER_ERROR)
      .json({ flag: "error", message: "Internal server error" });
  }
};

const bulkStartAgent = async (req, res) => {
  res
    .status(responseCodes.SUCCESS)
    .json({ flag: "success", message: "Bulk Agent Started" });

  const SERVICE_ACCOUNT_USERNAME = process.env.RISE_SA_USERNAME;
  const SERVICE_ACCOUNT_PASSWORD = process.env.RISE_SA_PASSWORD
    ? process.env.RISE_SA_PASSWORD
    : await getServiceAccountPassword();

  for (const agent of req.body) {
    setImmediate(() => {
      const sshConfig = {
        username: SERVICE_ACCOUNT_USERNAME,
        password: SERVICE_ACCOUNT_PASSWORD,
        host: agent.hostname,
        port: 22,
        readyTimeout: 60000,
      };
      const osVersion = agent.osVersion ?? "7.10";
      const client = new Client();
      client.on("error", (err) => {
        console.error(`[${new Date().toISOString()}] Error occurred: ${err}`);
      });

      client.on("ready", () => {
        client.exec(
          osVersion.includes("6.")
            ? "sudo service risebot start"
            : "sudo systemctl start risebot",
          (err, stream) => {
            if (err) {
              console.error(
                `[${new Date().toISOString()}] Error occurred: ${err}`
              );
              client.end();
              return;
            }

            let commandOutput = "";
            stream.on("data", (data) => {
              commandOutput += data.toString();
            });

            stream.on("close", (code) => {
              if (code !== 0) {
                console.error(`Non-zero exit code: ${code}`, agent.hostname);
              } else {
                console.log("started" + commandOutput, agent.hostname);
              }
              client.end();
            });
          }
        );
      });

      client.connect(sshConfig);
    });
  }
};
const bulkStopAgent = async (req, res) => {
  scheduleBulkAction(req.body, putShutDown);
  res
    .status(responseCodes.SUCCESS)
    .json({ flag: "success", message: "Bulk Agent Stopped" });
};
const bulkRestartAgent = async (req, res) => {
  scheduleBulkAction(req.body, putRestartAgent);
  res
    .status(responseCodes.SUCCESS)
    .json({ flag: "success", message: "Bulk Agent ReStarted" });
};
const bulkUpgradeAgent = async (req, res) => {
  res
    .status(responseCodes.SUCCESS)
    .json({ flag: "success", message: "Bulk Agent Upgraded" });

  let versionData = {
    agentpath: req.query.agentpath,
    version: req.query.risebotAgentVersion,
  };
  for (var agent of req.body) {
    (function (currentAgent) {
      setImmediate(() => {
        updateVersion({ ...currentAgent, ...versionData });
      });
    })(agent);
  }
};

const scheduleBulkAction = async (selectedAgents, actionFunction) => {
  for (const agent of selectedAgents) {
    setImmediate(() => {
      actionFunction(agent);
    });
  }
};

const getMasterAgentsData = async (req, res) =>
  connectDatabase(async (collections) => {
    const reqbody = req.method === "GET" ? req.query : req.body;
    const limit = parseInt(reqbody.limit) || 100;
    const pageNo = parseInt(reqbody.pageNo) || 1;
    const skip = (pageNo - 1) * limit;

    const query = buildQuery(reqbody);

    const resultSet = await collections.agentMasterList
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    const totalRows = await collections.agentMasterList.countDocuments();
    const totalPage = Math.ceil(totalRows / limit);

    const result = {
      limit,
      pageNo,
      totalPage,
      totalCount: totalRows,
      totalData: resultSet,
    };

    res.status(responseCodes.SUCCESS).json({ flag: "success", data: result });
  });
const insertMasterAgent = async (req, res) =>
  connectDatabase(async (collections) => {
    const hostnamesArray = req.body.hostnames.split(",");
    const recordsToInsert = hostnamesArray.map((hostname) => ({
      hostname,
      createdAt: new Date(),
    }));

    const uniqueHostnames = new Set(hostnamesArray);

    const existingRecords = await collections.agentMasterList
      .find({ hostname: { $in: [...uniqueHostnames] } })
      .toArray();

    const uniqueRecordsToInsert = recordsToInsert.filter((record) => {
      return !existingRecords.some(
        (existingRecord) => existingRecord.hostname === record.hostname
      );
    });

    if (uniqueRecordsToInsert.length > 0) {
      const result = await collections.agentMasterList.insertMany(
        uniqueRecordsToInsert
      );
      res.status(responseCodes.SUCCESS).json({
        flag: "success",
        data: `${result.insertedCount} records inserted successfully.`,
      });
    } else {
      res.status(responseCodes.SUCCESS).json({
        flag: "error",
        error: `Failed while adding hostname: Hostname ${hostnamesArray} already exists`,
      });
    }
  });
const deleteAgent = async (req, res) =>
  connectDatabase(async (collections) => {
    const hostname = req.query.hostname;
    const deleteResult = await collections.agentMasterList.deleteOne({
      hostname: hostname,
    });
    res.status(responseCodes.SUCCESS).json({
      flag: "success",
      data: `${deleteResult.deletedCount} records deleted successfully.`,
    });
  });

const validateAgent = async (req, res) => {
  try {
    await connectDatabase(async (collections) => {
      const version = req.body.version;
      let agentType = req.body.agentType || "rustlinux";
      const osVersion = req.body.osVersion;

      const osMajorVersion = osVersion?.split(".")[0];

      const result = await collections.agentsVersion.findOne({
        agentVersion: version,
        compatibleOS: {
          $elemMatch: {
            agentType: { $regex: agentType, $options: "i" },
            osVersion: { $regex: `^${osMajorVersion}` },
          },
        },
      });

      const isCompatible = !!result;
      res.status(responseCodes.SUCCESS).json({ isCompatible });
    });
  } catch (error) {
    res
      .status(responseCodes.SERVER_ERROR)
      .json({ isCompatible: false, message: "An error occurred" + error });
  }
};
const manageVersions = async (req, res) =>
  connectDatabase(async (collections) => {
    const versions = req.body;
    const method = req.method;

    if (!Array.isArray(versions)) {
      return res.status(responseCodes.ERROR).json({
        flag: "error",
        message:
          "Invalid input format. Expected an array of version documents.",
      });
    }

    try {
      if (method === "POST") {
        const insertResults = await Promise.all(
          versions.map(async (version) => {
            const existingRecord = await collections.agentsVersion.findOne({
              agentVersion: version.agentVersion,
            });
            if (existingRecord) {
              return { success: false, version: version.agentVersion };
            } else {
              await collections.agentsVersion.insertOne(version);
              return { success: true, version: version.agentVersion };
            }
          })
        );

        const successCount = insertResults.filter(
          (result) => result.success
        ).length;
        const errorCount = insertResults.length - successCount;

        res.status(responseCodes.SUCCESS).json({
          flag: errorCount > 0 ? "partial_success" : "success",
          data: `${successCount} records inserted successfully, ${errorCount} records failed.`,
        });
      } else if (method === "PUT") {
        const updateResults = await Promise.all(
          versions.map(async (version) => {
            const result = await collections.agentsVersion.updateOne(
              { agentVersion: version.agentVersion },
              { $set: version },
              { upsert: true }
            );
            return {
              success: result.modifiedCount > 0 || result.upsertedCount > 0,
              version: version.agentVersion,
            };
          })
        );

        const successCount = updateResults.filter(
          (result) => result.success
        ).length;
        const errorCount = updateResults.length - successCount;

        res.status(responseCodes.SUCCESS).json({
          flag: errorCount > 0 ? "partial_success" : "success",
          data: `${successCount} records updated successfully, ${errorCount} records failed.`,
        });
      } else {
        res
          .status(responseCodes.ERROR)
          .json({ flag: "error", message: "Invalid HTTP method." });
      }
    } catch (error) {
      console.error("Error handling versions:", error);
      res
        .status(responseCodes.SERVER_ERROR)
        .json({ flag: "error", message: "Error occurred " });
    }
  });

const deleteVersion = async (req, res) =>
  connectDatabase(async (collections) => {
    const agentVersion = req.query.agentVersion;

    if (!agentVersion) {
      return res
        .status(responseCodes.ERROR)
        .json({ flag: "error", message: "agentVersion required." });
    }

    try {
      const deleteResult = await collections.agentsVersion.deleteOne({
        agentVersion,
      });
      res.status(responseCodes.SUCCESS).json({
        flag: "success",
        data: `${deleteResult.deletedCount} record deleted.`,
      });
    } catch (error) {
      console.error("Error:", error);
      res
        .status(responseCodes.SERVER_ERROR)
        .json({ flag: "error", message: "Deletion error." });
    }
  });
const handleCreateNotificationFun = async (collections, data) => {
  try {
    const { message, type, username, command } = data;
    const notificationObj = {
      message: await encrypt(message),
      type: await encrypt(type),
      username: await encrypt(username),
      command: await encrypt(command ? command : ""),
    };

    await collections.notifcation.insertOne({
      ...notificationObj,
      readBy: [],
      date: new Date(),
    });
    return true;
  } catch (error) {
    return true;
  }
};

const verifyUserPermissions = async (req, res) => {
  try {
    await connectDatabase(async (collections) => {
      const user = req.body.user;
      const command = req.body.command;
      const hostname = req.body.hostname;

      if (!command) {
        return res.status(responseCodes.SUCCESS).json({
          flag: "error",
          message: "Please provide command",
        });
      }

      if (!hostname) {
        return res.status(responseCodes.SUCCESS).json({
          flag: "error",
          message: "Please provide hostname",
        });
      }

      if (!user) {
        return res.status(responseCodes.SUCCESS).json({
          flag: "error",
          message: "Please provide user",
        });
      }

      // eslint-disable-next-line no-useless-escape
      const commandPrefix = command.split(/[ \-]/)[0];

      const userResult = await collections.users
        .find({
          usernames: { $in: [new RegExp(`^${user}$`, "i")] },
          endDate: { $gt: new Date() },
        })
        .toArray();

      if (!userResult) {
        return res.status(responseCodes.SUCCESS).json({
          flag: "error",
          message: "User not found",
        });
      }

      let allServers = [];
      let allCommands = [];

      for (const user of userResult) {
        if (user.isServerGroupSelected) {
          const serverNames = user.serverGroupName
            .split(",")
            .map((name) => name.trim());

          const serverGroups = await collections.server_group
            .find({ group_name: { $in: serverNames } })
            .toArray();

          serverGroups.forEach((group) => {
            if (group.server) {
              allServers = [...allServers, ...group.server];
            }
          });
        } else {
          allServers = [...allServers, ...user.servers];
        }

        if (user.isAllowed) {
          if (user.isCommandGroupSelected) {
            const commandGroupNames = user.commandGroupName
              .split(",")
              .map((name) => name.trim());
            const commandGroups = await collections.groupconfig
              .find({ name: { $in: commandGroupNames } })
              .toArray();

            commandGroups.forEach((group) => {
              if (group.commands) {
                allCommands = [...allCommands, ...group.commands];
              }
            });
          } else {
            allCommands = [...allCommands, ...user.commands];
          }
        }
      }

      const isServerInGroup = allServers.some((server) =>
        new RegExp(`^${hostname}$`, "i").test(server)
      );

      let isAuth = false;
      const currentDate = new Date();

      if (isServerInGroup) {
        const commandRegex = new RegExp(`^${commandPrefix}(?:[-\\s]|$)`, "i");

       
        const commandExists = allCommands?.some((cmd) =>
          commandRegex.test(cmd)
        );

        isAuth = commandExists;
      }

      const blacklisted = await collections.blacklistedCommands.findOne({
        commands: {
          $elemMatch: {
            $regex: `^${commandPrefix}(?:[-\\s]|$)`,
            $options: "i",
          },
        },
      });
      let isAuthorize = isServerInGroup ? isAuth : false;
      const isBlacklisted = !!blacklisted;
      let message;
      if (isBlacklisted && !isAuthorize) {
        message =
          "The command is blacklisted and the user is not authorized to execute it.";
        await handleCreateNotificationFun(collections, {
          message: `User ${user} attempted to execute blacklisted command`,
          type: "Alert",
          username: user,
          command,
        });
      } else if (isBlacklisted) {
        message = "The command is blacklisted and cannot be executed.";
        await handleCreateNotificationFun(collections, {
          message: `User ${user} attempted to execute blacklisted command`,
          type: "Alert",
          username: user,
          command,
        });
      } else if (!isAuthorize) {
        message = "User is not authorized to execute the command.";
        await handleCreateNotificationFun(collections, {
          message: `Unauthorized command execution attempt by ${user}`,
          type: "Warning",
          username: user,
          command,
        });
      } else if (currentDate > isServerInGroup?.endDate) {
        isAuthorize = false;
        message = "User access has expired.";
      } else {
        message = "User is authorized to execute the command.";
      }

      res.status(responseCodes.SUCCESS).json({
        isAuthorize,
        isBlacklisted,
        message,
        commandType: userResult?.commandType || "",
        adGroup: userResult?.adGroup || "",
      });
    });
  } catch (error) {
    console.log(error);
    res
      .status(responseCodes.SERVER_ERROR)
      .json({ isAuthorize: false, message: "An error occurred" + error });
  }
};

const deleteADGroup = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;
      const { groupId, username } = reqbody;

      const reqBodyValidation = Joi.object({
        groupId: Joi.string()
          .custom(objectIdValidator, "Object Id validation")
          .required(),
        username: Joi.string().required(),
      });

      const validationBody = { groupId, username };
      const ip = req.ip || req.connection.remoteAddress;
      const validationResult = reqBodyValidation.validate(validationBody);

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

      const delResultSet = await collections.users.findOne({
        _id: ObjectId(groupId),
      });
      const resultSet = await collections.users.deleteOne({
        _id: ObjectId(groupId),
      });
      if (delResultSet) {
        await collections.adgroups.updateOne(
          { group: delResultSet?.adGroup },
          { $set: { isGroupUsed: false } }
        );
      }
      if (resultSet) {
        handleCreateLogFun(collections, {
          ip: ip,
          username: username,
          actionType: "Deleted Access",
          module: "Access Management",
          prevValue: "",
          changes: "Record Deleted",
          updatedValue: `${ObjectId(groupId)} Access deleted`,
        });
      }

      res.status(responseCodes.SUCCESS).json({
        flag: "success",
        message: APIMessages.SUCCESS,
        data: resultSet ?? {},
      });
    } catch (error) {
      res.status(responseCodes.SERVER_ERROR).json({
        flag: "error",
        error: error.message,
        message: APIMessages.SERVER_ERROR,
      });
    }
  });

const getADGroupList = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const searchFilter = {};
      const sortFilter = { group: 1 };

      const resultSet = await collections.adgroups
        .find(searchFilter)
        .sort(sortFilter)
        .toArray();

      res.status(responseCodes.SUCCESS).json({
        flag: "success",
        message: APIMessages.SUCCESS,
        data: resultSet ?? {},
      });
    } catch (error) {
      res.status(responseCodes.SERVER_ERROR).json({
        flag: "error",
        error: error.message,
        message: APIMessages.SERVER_ERROR,
      });
    }
  });

const getADGroupDetails = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;
      const { adGroupName } = reqbody;

      const configReqBodyValidation = Joi.object({
        adGroupName: Joi.string(),
      });

      const validationBody = { adGroupName };

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

      const resultSet = await collections.adgroups.findOne({
        group: adGroupName,
      });

      res.status(responseCodes.SUCCESS).json({
        flag: "success",
        message: APIMessages.SUCCESS,
        data: resultSet ?? {},
      });
    } catch (error) {
      res.status(responseCodes.SERVER_ERROR).json({
        flag: "error",
        error: error.message,
        message: APIMessages.SERVER_ERROR,
      });
    }
  });

const createRequest = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;
      const {
        isCommandGroupSelected,
        commandGroupName,
        isServerGroupSelected,
        serverGroupName,
        commands,
        reason,
        servers,
      } = reqbody;

      let username = reqbody?.username ?? "";
      username = username?.toLowerCase() ?? "";

      let { commandType, startDate, endDate } = reqbody;

      let adGroupName = "";

      const userRequestBody = Joi.object({
        servers: Joi.string().allow(""),
        requestedBy: Joi.string().required(),
        commandType: Joi.string().allow(""),
        commands: Joi.string().allow(""),
        commandGroupName: Joi.string().allow(""),
        serverGroupName: Joi.string().allow(""),
        reason: Joi.string(),
        startDate: Joi.date().required(),
        endDate: Joi.date().required(),
        isCommandGroupSelected: Joi.boolean().required(),
        isServerGroupSelected: Joi.boolean().required(),
      });

      const userObj = {
        commandType,
        startDate,
        endDate,
        requestedBy: username,
        commandGroupName,
        isCommandGroupSelected,
        serverGroupName,
        isServerGroupSelected,
      };

      if (reason) {
        userObj["reason"] = reason;
      }

      if (isCommandGroupSelected === false && commandType === "") {
        return res.status(responseCodes.SUCCESS).json({
          flag: "error",
          error: "Command Type is required",
        });
      }
      if (isCommandGroupSelected === false && commands === "") {
        return res.status(responseCodes.SUCCESS).json({
          flag: "error",
          error: "Commands are required",
        });
      }
      if (isServerGroupSelected === false && servers === "") {
        return res.status(responseCodes.SUCCESS).json({
          flag: "error",
          error: "Servers are required",
        });
      }

      if (isCommandGroupSelected === true && commandGroupName === "") {
        return res.status(responseCodes.SUCCESS).json({
          flag: "error",
          error: "Command Group is required",
        });
      }

      if (isServerGroupSelected === true && serverGroupName === "") {
        return res.status(responseCodes.SUCCESS).json({
          flag: "error",
          error: "Server Group is required",
        });
      }

      startDate = new Date(startDate);
      endDate = new Date(endDate);

      if (endDate <= startDate) {
        return res.status(responseCodes.SUCCESS).json({
          flag: "error",
          error: "Please provide valid dates",
        });
      }

      if (servers && !isServerGroupSelected) {
        userObj["servers"] = servers;
      }

      if (commands && !isCommandGroupSelected) {
        userObj["commands"] = commands;
      }

      const validationResult = userRequestBody.validate(userObj);

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

      // Clean up commands
      if (typeof commands === "string") {
        userObj["commands"] = commands
          .split(",")
          .map((cmd) => cmd.trim())
          .filter((cmd) => cmd !== "");
      }

      if (typeof servers === "string") {
        userObj["servers"] = servers
          .split(",")
          .map((cmd) => cmd.trim())
          .filter((cmd) => cmd !== "");
      }

      if (isCommandGroupSelected) {
        let cGrp = commandGroupName?.split(",");

        cGrp = await Promise.all(cGrp.map((name) => encrypt(name.trim())));

        const commandGroupsList = await collections.groupconfig
          .find({
            name: { $in: cGrp },
            isDeleted: await encrypt(false),
          })
          .toArray();

        const allCommandGroupRef = commandGroupsList.map((item) => item._id);

        userObj["commandGroupsRef"] = allCommandGroupRef;
      }

      if (isServerGroupSelected) {
        let cGrp = serverGroupName?.split(",");

        cGrp = await Promise.all(
          cGrp.map((group_name) => encrypt(group_name.trim()))
        );

        const serverGroupsList = await collections.server_group
          .find({
            group_name: { $in: cGrp },
            isDeleted: await encrypt(false),
          })
          .toArray();

        adGroupName = [
          ...new Set(
            serverGroupsList.flatMap((item) => item.approverAdGroup || [])
          ),
        ];

        const allServerGroupRef = serverGroupsList.map((item) => item._id);

        userObj["serverGroupsRef"] = allServerGroupRef;
      } else {
        const agentsRes = await collections.cybersphere_servers
          .find(
            { hostname: { $in: userObj["servers"] } },
            {
              projection: { cmdb: 1, hostname: 1, _id: 0 },
            }
          )
          .toArray();

        const uniqueGroupNames = agentsRes.reduce((acc, curr) => {
          const groupName = curr.cmdb?.iamGroupName;
          if (groupName && !acc.includes(groupName)) {
            acc.push(groupName);
          }
          return acc;
        }, []);

        adGroupName = uniqueGroupNames;
      }

      const approverData = await collections.adgroups
        .find({
          group: { $in: adGroupName },
          isDeleted: false,
        })
        .toArray();

      if (approverData && approverData.length > 0) {
        // Array to collect all names from the approvers list
        const allNames = [];

        // Dynamically process approversList
        const approversList = approverData.flatMap((group) => {
          return Object.keys(group)
            .filter((key) => key.startsWith("l") && group[key]) 
            .map((key) => {
              const { approvers } = group[key];

              // Collect all approver names
              approvers.forEach((approver) => {
                allNames.push(approver.name);
              });

              return {
                [key]: {
                  levelStatus: "Pending",
                  actionBy: "",
                  Timestamp: null,
                  approvers: approvers.map((approver) => ({
                    name: approver?.jnjMSUsername?.toLowerCase() ?? "",
                    full_name: approver?.name ?? "",
                    sub: approver?.sub ?? "",
                    email: approver?.email ?? "",
                    actionStatus: "Pending",
                    actionTimestamp: null,
                    comments: null,
                  })),
                },
              };
            });
        });

        // Assign the results to userObj
        userObj["approver"] = await encrypt(allNames);
        userObj["approversList"] = approversList;
      } else {
        userObj["approversList"] = [];
      }

      let resultSet = [];
      userObj["startDate"] = startDate;
      userObj["endDate"] = endDate;
      userObj["status"] = await encrypt("pending");
      userObj["isReadyForApproval"] = false;
      userObj["createdAt"] = new Date();
      userObj["reason"] = await encrypt(userObj?.reason);
      userObj["commandType"] = await encrypt(userObj?.commandType);
      userObj["servers"] = userObj?.servers
        ? await Promise.all(
          userObj?.servers?.map(async (server) => await encrypt(server))
        )
        : [];
      userObj["commands"] = userObj?.commands
        ? await Promise.all(
          userObj?.commands?.map(async (command) => await encrypt(command))
        )
        : [];
      userObj["requestedBy"] = await encrypt(userObj?.requestedBy);
      userObj["commandGroupName"] = await encrypt(userObj?.commandGroupName);
      userObj["isCommandGroupSelected"] = await encrypt(
        userObj?.isCommandGroupSelected
      );
      userObj["serverGroupName"] = await encrypt(userObj?.serverGroupName);
      userObj["isServerGroupSelected"] = await encrypt(
        userObj?.isServerGroupSelected
      );
      userObj["ReqNumber"] = generateReqNumber();

      resultSet = await collections.requestaccess.insertOne(userObj);
      sendApprovalEmail({
        to: approverData?.approverDetails?.email ?? "",
        username,
        approver: approverData?.approverDetails?.username ?? "",
        requestedGroup: adGroupName,
      });

      res.status(responseCodes.SUCCESS).json({
        success: true,
        statusCode: responseCodes.SUCCESS,
        message: APIMessages.SUCCESS,
        data: resultSet.ops,
      });
    } catch (e) {
      console.log(e);
      res.status(responseCodes.SERVER_ERROR).json({
        success: false,
        statusCode: responseCodes.SERVER_ERROR,
        message: APIMessages.SERVER_ERROR,
      });
    }
  });

const getRequestList = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;
      let { status } = reqbody;

      let username = reqbody?.username ?? "";
      username = username.toLowerCase();

      const limit = parseInt(reqbody.pageSize) || 10;
      const pageNo = parseInt(reqbody.pageNo - 1) || 0;
      const skip = pageNo * limit;

      if (status) {
        status = status.split(",");
      }
      const userRequestBody = Joi.object({
        requestor: Joi.string().required(),
      });

      const userObj = {
        requestor: username,
      };

      const validationResult = userRequestBody.validate(userObj);

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

      const searchFilter = { requestedBy: await encrypt(username) };
      if (status) {
        const encryptedStatus = await Promise.all(
          status.map(async (s) => await encrypt(s))
        );
        searchFilter.status = { $in: encryptedStatus };
      }
      const resultSet = await collections.requestaccess
        .find(searchFilter)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .toArray();

      const uniqueRequestedBy = Array.from(
        new Set(
          await Promise.all(
            resultSet.map(async (item) =>
              (await decrypt(item.requestedBy)).toLowerCase()
            )
          )
        )
      );

      let requestorsDetails = [];
      if (uniqueRequestedBy.length > 0) {
        const requestorFilters = {
          $or: uniqueRequestedBy.map((username) => ({
            jnjMSUsername: { $regex: `^${username}$`, $options: "i" },
          })),
        };

        requestorsDetails = await collections.iamusers
          .find(requestorFilters, {
            projection: { name: 1, jnjMSUsername: 1, email: 1, sub: 1 },
          })
          .toArray();
      }

      const commandGroupIds = [
        ...new Set(resultSet.flatMap((item) => item?.commandGroupsRef || [])),
      ];
      const commandGroups = await collections.groupconfig
        .find(
          { _id: { $in: commandGroupIds.map((id) => ObjectId(id)) } },
          { projection: { commands: 1, name: 1 } }
        )
        .toArray();

      const serverGroupIds = [
        ...new Set(resultSet.flatMap((item) => item?.serverGroupsRef || [])),
      ];

      const uniqueServers = Array.from(
        new Set(
          (
            await Promise.all(
              resultSet.flatMap(
                (record) =>
                  record.servers?.map(async (encryptedServer) => {
                    try {
                      return await decrypt(encryptedServer);
                    } catch (error) {
                      return null;
                    }
                  }) || []
              )
            )
          ).filter((server) => server !== null)
        )
      );

      const uniqueCommands = [
        ...new Set(resultSet.flatMap((item) => item?.commands || [])),
      ];

      const commandSearchFilter = {};
      commandSearchFilter["$or"] = [
        { "commands.command": { $in: uniqueCommands } },
        { "exclude.command": { $in: uniqueCommands } },
      ];

      const cmdData = await collections.groupconfig
        .find(commandSearchFilter, { projection: { commands: 1, name: 1 } })
        .toArray();

      const serData = await collections.agents
        .find(
          { hostname: { $in: uniqueServers } },
          { projection: { cmdb: 1, hostname: 1 } }
        )
        .toArray();

      const serverGroups = await collections.server_group
        .find(
          { _id: { $in: serverGroupIds.map((id) => ObjectId(id)) } },
          { projection: { group_name: 1, server: 1 } }
        )
        .toArray();

      for (const r of commandGroups) {
        r.name = await decrypt(r.name);
        r.commands = await Promise.all(
          r.commands.map(async (cmd) => {
            return {
              ...cmd,
              command: await decrypt(cmd.command),
              runAsRoot: (await decrypt(cmd.runAsRoot)) === "true", 
              isSubDirectoryAllowed:
                (await decrypt(cmd.isSubDirectoryAllowed)) === "true", 
              isExcluded: (await decrypt(cmd.isExcluded)) === "true",
              sudoers: cmd?.sudoers?.length
                ? await Promise.all(
                  cmd.sudoers.map((sudoer) => decrypt(sudoer))
                )
                : [],
              directory: cmd?.directory?.length
                ? await Promise.all(cmd.directory.map((dir) => decrypt(dir)))
                : [],
              directoryGroup: cmd?.directoryGroup?.length
                ? await Promise.all(
                  cmd.directoryGroup.map((dir) => decrypt(dir))
                )
                : [],
              environment: cmd?.environment?.length
                ? await Promise.all(cmd.environment.map((env) => decrypt(env)))
                : [],
              allowedSubUsers: cmd?.allowedSubUsers?.length
                ? await Promise.all(
                  cmd.allowedSubUsers.map((user) => decrypt(user))
                )
                : [],
              allowedSubUserGroup: cmd?.allowedSubUserGroup?.length
                ? await Promise.all(
                  cmd.allowedSubUserGroup.map((group) => decrypt(group))
                )
                : [],
              editMode: (await decrypt(cmd.editMode)) === "true", 
            };
          })
        );
      }

      for (const r of serverGroups) {
        r.group_name = await decrypt(r.group_name);
        r.server = await Promise.all(
          r.server.map(async (server) => await decrypt(server))
        );
      }

      for (const r of cmdData) {
        r.name = await decrypt(r.name);
        r.commands = await Promise.all(
          r.commands.map(async (cmd) => {
            return {
              ...cmd,
              command: await decrypt(cmd.command),
              runAsRoot: (await decrypt(cmd.runAsRoot)) === "true",
              isSubDirectoryAllowed:
                (await decrypt(cmd.isSubDirectoryAllowed)) === "true",
              isExcluded: (await decrypt(cmd.isExcluded)) === "true",
              sudoers: cmd?.sudoers?.length
                ? await Promise.all(
                  cmd.sudoers.map((sudoer) => decrypt(sudoer))
                )
                : [],
              directory: cmd?.directory?.length
                ? await Promise.all(cmd.directory.map((dir) => decrypt(dir)))
                : [],
              directoryGroup: cmd?.directoryGroup?.length
                ? await Promise.all(
                  cmd.directoryGroup.map((dir) => decrypt(dir))
                )
                : [],
              environment: cmd?.environment?.length
                ? await Promise.all(cmd.environment.map((env) => decrypt(env)))
                : [],
              allowedSubUsers: cmd?.allowedSubUsers?.length
                ? await Promise.all(
                  cmd.allowedSubUsers.map((user) => decrypt(user))
                )
                : [],
              allowedSubUserGroup: cmd?.allowedSubUserGroup?.length
                ? await Promise.all(
                  cmd.allowedSubUserGroup.map((group) => decrypt(group))
                )
                : [],
              editMode: (await decrypt(cmd.editMode)) === "true", 
            };
          })
        );
      }

      for (const ad of resultSet) {
        ad.commandType = await decrypt(ad.commandType);
        ad.commandGroupName = await decrypt(ad.commandGroupName);
        ad.isCommandGroupSelected =
          (await decrypt(ad.isCommandGroupSelected)) === "true";
        ad.serverGroupName = await decrypt(ad.serverGroupName);
        ad.isServerGroupSelected =
          (await decrypt(ad.isServerGroupSelected)) === "true";
        ad.requestedBy = await decrypt(ad.requestedBy);
        ad.requestorDetails = requestorsDetails.find(
          (e) =>
            e?.jnjMSUsername?.toLowerCase() === ad?.requestedBy?.toLowerCase()
        );
        ad.status = await decrypt(ad.status);
        ad.reason = await decrypt(ad.reason);
        ad.servers = await Promise.all(
          ad.servers.map(async (server) => await decrypt(server))
        );

        ad.serverDetails = ad.servers
          ? ad.servers
            .map((ser) => {
              return (
                serData.find(
                  (sdata) =>
                    sdata.hostname.toLowerCase() === ser.toLowerCase()
                ) || null
              );
            })
            .filter((s) => s !== null)
          : [];
        ad.commands = await Promise.all(
          ad.commands.map(async (command) => await decrypt(command))
        );

        ad.commandDetails = ad.commands
          ? ad.commands
            .map((cmd) => {
              return (
                cmdData.find((cmdDetail) =>
                  cmdDetail.commands.some(
                    (commandObj) =>
                      commandObj.command?.toLowerCase() === cmd.toLowerCase()
                  )
                ) || null
              );
            })
            .filter((detail) => detail !== null)
          : [];

        ad.commandGroupDetails = ad.commandGroupsRef
          ? ad.commandGroupsRef
            .map((refId) => {
              return (
                commandGroups.find(
                  (group) => group._id.toString() === refId.toString()
                ) || null
              );
            })
            .filter((group) => group !== null)
          : [];
        const serverGroupIds =
          ad.serverGroupsRef?.map((id) => new ObjectId(id)) ?? [];
        ad.serverGroupDetails = ad.serverGroupsRef
          ? ad.serverGroupsRef
            .map((refId) => {
              return (
                serverGroups.find(
                  (group) => group._id.toString() === refId.toString()
                ) || null
              );
            })
            .filter((group) => group !== null)
          : [];
        if (serverGroupIds.length > 0) {
          const groupname = await collections.server_group
            .find({
              _id: { $in: serverGroupIds },
            })
            .toArray();
          ad.adGroup = groupname.map((e) => e.approverAdGroup)?.join(",") ?? "";
        } else {
          const agentsRes = await collections.cybersphere_servers
            .find(
              { hostname: { $in: ad["servers"] } },
              {
                projection: { cmdb: 1, hostname: 1, _id: 0 },
              }
            )
            .toArray();

          const uniqueGroupNames = agentsRes.reduce((acc, curr) => {
            const groupName = curr.cmdb?.iamGroupName;
            if (groupName && !acc.includes(groupName)) {
              acc.push(groupName);
            }
            return acc;
          }, []);

          ad.adGroup = uniqueGroupNames.join(",");
        }
        ad.approver = await decrypt(ad.approver);
      }

      const totalCount = await collections.requestaccess.countDocuments(
        searchFilter
      );
      const totalPage = Math.ceil(totalCount / limit);

      const pagination = {
        limit,
        pageNo: pageNo + 1,
        rowCount: resultSet?.length || 0,
        totalPage: isNaN(totalPage) ? 1 : totalPage,
        totalCount,
      };

      res.status(responseCodes.SUCCESS).json({
        flag: "success",
        message: APIMessages.SUCCESS,
        data: resultSet ?? {},
        pagination,
      });
    } catch (error) {
      res.status(responseCodes.SERVER_ERROR).json({
        flag: "error",
        error: error.message,
        message: APIMessages.SERVER_ERROR,
      });
    }
  });

const encryptFields = async (document) => {
  try {
    // Encrypt top-level fields
    document.adGroup = await encrypt(document.adGroup);
    document.servers = await Promise.all(
      document.servers.map((server) => encrypt(server))
    );
    document.commandType = await encrypt(document.commandType);
    document.commands = await Promise.all(
      document.commands.map((command) => encrypt(command))
    );
    document.isAllowed = await encrypt(document.isAllowed.toString());
    document.requestedBy = await encrypt(document.requestedBy);
    document.commandGroupName = await encrypt(document.commandGroupName);
    document.isCommandGroupSelected = await encrypt(
      document.isCommandGroupSelected.toString()
    );
    document.serverGroupName = await encrypt(document.serverGroupName);
    document.isServerGroupSelected = await encrypt(
      document.isServerGroupSelected.toString()
    );
    document.status = await encrypt(document.status);
    document.isReadyForApproval = await encrypt(
      document.isReadyForApproval.toString()
    );
    return document;
  } catch (error) {
    console.error("Error encrypting fields:", error);
    throw error;
  }
};

const encryptAllRequestAccess = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const resultSet = await collections.requestaccess.find().toArray();
      console.log(resultSet, "result123");
      for (const record of resultSet) {
        const encryptedDocument = await encryptFields(record);
        console.log("Encrypted Document:", encryptedDocument);
        await collections.requestaccess.updateOne(
          { _id: record._id },
          { $set: encryptedDocument }
        );
      }
      res.status(200).send("All records encrypted and updated successfully.");
    } catch (error) {
      console.error("Error occurred:", error);
      res.status(500).send("Encryption failed.");
    }
  });

const getApprovalList = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;
      let { status, requestors, startDate, endDate } = reqbody;
      let username = reqbody?.username ?? "";
      const limit = parseInt(reqbody.pageSize) || 10;
      const pageNo = parseInt(reqbody.pageNo - 1) || 0;
      const skip = pageNo * limit;
      username = username.toLowerCase();

      const userRequestBody = Joi.object({
        approver: Joi.string().required(),
      });

      const userObj = {
        approver: username,
      };

      const validationResult = userRequestBody.validate(userObj);

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

      const searchFilter = {
        $or: [
          { "approversList.l1.approvers.name": username },
          { "approversList.l2.approvers.name": username },
          { "approversList.l3.approvers.name": username },
        ],
      };

      if (status) {
        const statusArray = status?.split(",").map((s) => s.trim());
        if (statusArray.length > 1) {
          const encryptedStatus = await Promise.all(
            statusArray.map(async (s) => await encrypt(s))
          );
          searchFilter.status = { $in: encryptedStatus };
        } else {
          const encryptedStatus = await encrypt(status?.trim());
          searchFilter.status = encryptedStatus;
        }
      }

      if (requestors) {
        const requestorsArray = requestors?.split(",").map((r) => r.trim());
        if (requestorsArray.length > 1) {
          const encryptedRequestors = await Promise.all(
            requestorsArray.map(async (r) => await encrypt(r))
          );
          searchFilter.requestedBy = { $in: encryptedRequestors };
        } else {
          const encryptedRequestor = await encrypt(requestors?.trim());
          searchFilter.requestedBy = encryptedRequestor;
        }
      }

      if (startDate !== "undefined" || endDate !== "undefined") {
        const dateFilter = {};

        if (startDate) {
          const start = new Date(new Date(startDate).setUTCHours(0, 0, 0, 0));
          dateFilter.startDate = { $gte: start };
        }

        if (endDate) {
          const end = new Date(new Date(endDate).setUTCHours(23, 59, 59, 999));
          dateFilter.endDate = dateFilter.endDate || {};
          dateFilter.endDate.$lte = end;
        }

        searchFilter.$and = [
          { startDate: dateFilter.startDate },
          { endDate: dateFilter.endDate },
        ];
      }

      const resultSet = await collections?.requestaccess
        ?.find(searchFilter)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .toArray();

      const uniqueRequestedBy = Array.from(
        new Set(
          await Promise.all(
            resultSet.map(async (item) =>
              (await decrypt(item.requestedBy)).toLowerCase()
            )
          )
        )
      );

      let requestorsDetails = [];
      if (uniqueRequestedBy.length > 0) {
        const requestorFilters = {
          $or: uniqueRequestedBy.map((username) => ({
            jnjMSUsername: { $regex: `^${username}$`, $options: "i" },
          })),
        };

        requestorsDetails = await collections.iamusers
          .find(requestorFilters, {
            projection: { name: 1, jnjMSUsername: 1, email: 1, sub: 1 },
          })
          .toArray();
      }

      const commandGroupIds = [
        ...new Set(resultSet.flatMap((item) => item?.commandGroupsRef || [])),
      ];
      const commandGroups = await collections.groupconfig
        .find(
          { _id: { $in: commandGroupIds.map((id) => ObjectId(id)) } },
          { projection: { commands: 1, name: 1 } }
        )
        .toArray();

      const serverGroupIds = [
        ...new Set(resultSet.flatMap((item) => item?.serverGroupsRef || [])),
      ];
      const serverGroups = await collections.server_group
        .find(
          { _id: { $in: serverGroupIds.map((id) => ObjectId(id)) } },
          { projection: { group_name: 1, server: 1 } }
        )
        .toArray();

      const uniqueServers = Array.from(
        new Set(
          (
            await Promise.all(
              resultSet.flatMap(
                (record) =>
                  record.servers?.map(async (encryptedServer) => {
                    try {
                      return await decrypt(encryptedServer);
                    } catch (error) {
                      return null;
                    }
                  }) || []
              )
            )
          ).filter((server) => server !== null)
        )
      );

      const uniqueCommands = [
        ...new Set(resultSet.flatMap((item) => item?.commands || [])),
      ];

      const commandSearchFilter = {};
      commandSearchFilter["$or"] = [
        { "commands.command": { $in: uniqueCommands } },
        { "exclude.command": { $in: uniqueCommands } },
      ];

      const cmdData = await collections.groupconfig
        .find(commandSearchFilter, { projection: { commands: 1, name: 1 } })
        .toArray();

      const serData = await collections.agents
        .find(
          { hostname: { $in: uniqueServers } },
          { projection: { cmdb: 1, hostname: 1 } }
        )
        .toArray();

      for (const r of commandGroups) {
        r.name = await decrypt(r.name);
        r.commands = await Promise.all(
          r.commands.map(async (cmd) => {
            return {
              ...cmd,
              command: await decrypt(cmd.command),
              runAsRoot: (await decrypt(cmd.runAsRoot)) === "true", 
              isSubDirectoryAllowed:
                (await decrypt(cmd.isSubDirectoryAllowed)) === "true", 
              isExcluded: (await decrypt(cmd.isExcluded)) === "true", 
              sudoers: cmd?.sudoers?.length
                ? await Promise.all(
                  cmd.sudoers.map((sudoer) => decrypt(sudoer))
                )
                : [],
              directory: cmd?.directory?.length
                ? await Promise.all(cmd.directory.map((dir) => decrypt(dir)))
                : [],
              directoryGroup: cmd?.directoryGroup?.length
                ? await Promise.all(
                  cmd.directoryGroup.map((dir) => decrypt(dir))
                )
                : [],
              environment: cmd?.environment?.length
                ? await Promise.all(cmd.environment.map((env) => decrypt(env)))
                : [],
              allowedSubUsers: cmd?.allowedSubUsers?.length
                ? await Promise.all(
                  cmd.allowedSubUsers.map((user) => decrypt(user))
                )
                : [],
              allowedSubUserGroup: cmd?.allowedSubUserGroup?.length
                ? await Promise.all(
                  cmd.allowedSubUserGroup.map((group) => decrypt(group))
                )
                : [],
              editMode: (await decrypt(cmd.editMode)) === "true", 
            };
          })
        );
      }

      for (const r of cmdData) {
        r.name = await decrypt(r.name);
        r.commands = await Promise.all(
          r.commands.map(async (cmd) => {
            return {
              ...cmd,
              command: await decrypt(cmd.command),
              runAsRoot: (await decrypt(cmd.runAsRoot)) === "true",
              isSubDirectoryAllowed:
                (await decrypt(cmd.isSubDirectoryAllowed)) === "true",
              isExcluded: (await decrypt(cmd.isExcluded)) === "true", 
              sudoers: cmd?.sudoers?.length
                ? await Promise.all(
                  cmd.sudoers.map((sudoer) => decrypt(sudoer))
                )
                : [],
              directory: cmd?.directory?.length
                ? await Promise.all(cmd.directory.map((dir) => decrypt(dir)))
                : [],
              directoryGroup: cmd?.directoryGroup?.length
                ? await Promise.all(
                  cmd.directoryGroup.map((dir) => decrypt(dir))
                )
                : [],
              environment: cmd?.environment?.length
                ? await Promise.all(cmd.environment.map((env) => decrypt(env)))
                : [],
              allowedSubUsers: cmd?.allowedSubUsers?.length
                ? await Promise.all(
                  cmd.allowedSubUsers.map((user) => decrypt(user))
                )
                : [],
              allowedSubUserGroup: cmd?.allowedSubUserGroup?.length
                ? await Promise.all(
                  cmd.allowedSubUserGroup.map((group) => decrypt(group))
                )
                : [],
              editMode: (await decrypt(cmd.editMode)) === "true", 
            };
          })
        );
      }

      for (const r of serverGroups) {
        r.group_name = await decrypt(r.group_name);
        r.server = await Promise.all(
          r.server.map(async (server) => await decrypt(server))
        );
      }

      if (!Array.isArray(resultSet)) {
        console.error("resultSet is not an array:", resultSet);
        return res.status(responseCodes.SERVER_ERROR).json({
          flag: "error",
          error: "Unexpected result format from the database",
        });
      }

      for (const ad of resultSet) {
        ad.commandType = await decrypt(ad.commandType);
        ad.isAllowed = (await decrypt(ad.isAllowed)) === "true";
        ad.commandGroupName = await decrypt(ad.commandGroupName);
        ad.isCommandGroupSelected =
          (await decrypt(ad.isCommandGroupSelected)) === "true";
        ad.serverGroupName = await decrypt(ad.serverGroupName);
        ad.isServerGroupSelected =
          (await decrypt(ad.isServerGroupSelected)) === "true";
        ad.reason = await decrypt(ad.reason);
        ad.requestedBy = await decrypt(ad.requestedBy);
        ad.requestorDetails = requestorsDetails.find(
          (e) =>
            e?.jnjMSUsername?.toLowerCase() === ad?.requestedBy?.toLowerCase()
        );
        ad.approver = await decrypt(ad.approver);
        ad.status = await decrypt(ad.status);
        ad.servers = await Promise.all(
          ad.servers.map(async (server) => await decrypt(server))
        );

        ad.serverDetails = ad.servers
          ? ad.servers
            .map((ser) => {
              return (
                serData.find(
                  (sdata) =>
                    sdata.hostname.toLowerCase() === ser.toLowerCase()
                ) || null
              );
            })
            .filter((s) => s !== null)
          : [];

        ad.commands = await Promise.all(
          ad.commands.map(async (command) => await decrypt(command))
        );
        ad.commandDetails = ad.commands
          ? ad.commands
            .map((cmd) => {
              return (
                cmdData.find((cmdDetail) =>
                  cmdDetail.commands.some(
                    (commandObj) =>
                      commandObj.command?.toLowerCase() === cmd.toLowerCase()
                  )
                ) || null
              );
            })
            .filter((detail) => detail !== null)
          : [];

        ad.commandGroupDetails = ad.commandGroupsRef
          ? ad.commandGroupsRef
            .map((refId) => {
              return (
                commandGroups.find(
                  (group) => group._id.toString() === refId.toString()
                ) || null
              );
            })
            .filter((group) => group !== null)
          : [];
        if (ad.isReadyForApproval !== undefined) {
          ad.isReadyForApproval = Boolean(await decrypt(ad.isReadyForApproval));
        }
        ad.serverGroupDetails = ad.serverGroupsRef
          ? ad.serverGroupsRef
            .map((refId) => {
              return (
                serverGroups.find(
                  (group) => group._id.toString() === refId.toString()
                ) || null
              );
            })
            .filter((group) => group !== null)
          : [];
        const serverGroupIds =
          ad.serverGroupsRef?.map((id) => new ObjectId(id)) ?? [];

        if (serverGroupIds.length > 0) {
          const groupname = await collections.server_group
            .find({
              _id: { $in: serverGroupIds },
            })
            .toArray();
          ad.adGroup = groupname.map((e) => e.approverAdGroup)?.join(",") ?? "";
        } else {
          const agentsRes = await collections.cybersphere_servers
            .find(
              { hostname: { $in: ad["servers"] } },
              {
                projection: { cmdb: 1, hostname: 1, _id: 0 },
              }
            )
            .toArray();

          const uniqueGroupNames = agentsRes.reduce((acc, curr) => {
            const groupName = curr.cmdb?.iamGroupName;
            if (groupName && !acc.includes(groupName)) {
              acc.push(groupName);
            }
            return acc;
          }, []);

          ad.adGroup = uniqueGroupNames.join(",");
        }
      }

      for (const request of resultSet) {
        request.isReadyForApproval = false;
        if (request.approversList && Array.isArray(request.approversList)) {
          for (const level of request.approversList) {
            for (const [levelKey, levelData] of Object.entries(level)) {
              const approvers = levelData?.approvers || [];
              const isUserInApprovers = approvers.some(
                (approver) => approver.name === username
              );

              if (
                isUserInApprovers &&
                levelData.levelStatus === "ReadyToApprove"
              ) {
                request.isReadyForApproval = true;
                break;
              }
              if (
                isUserInApprovers &&
                levelData.levelStatus === "Pending" &&
                levelKey === "l1"
              ) {
                request.isReadyForApproval = true;
                break;
              }
            }
            if (request.isReadyForApproval) break;
          }
        }
      }

      const totalCount = await collections.requestaccess.countDocuments(
        searchFilter
      );
      const totalPage = Math.ceil(totalCount / limit);

      const pagination = {
        limit,
        pageNo: pageNo + 1,
        rowCount: resultSet?.length || 0,
        totalPage: isNaN(totalPage) ? 1 : totalPage,
        totalCount,
      };

      res.status(responseCodes.SUCCESS).json({
        flag: "success",
        message: APIMessages.SUCCESS,
        data: resultSet ?? {},
        pagination,
      });
    } catch (error) {
      res.status(responseCodes.SERVER_ERROR).json({
        flag: "error",
        error: error.message,
        message: APIMessages.SERVER_ERROR,
      });
    }
  });

const handleRequestApproval = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;
      const { requestId, actionStatus, comments, endDate } = reqbody;

      let username = reqbody?.username ?? "";
      username = username.toLowerCase();

      const userRequestBody = Joi.object({
        actionStatus: Joi.string().valid("assigned", "denied").required(),
        approver: Joi.string().required(),
        endDate: Joi.date().when("actionStatus", {
          is: "assigned",
          then: Joi.required(),
          otherwise: Joi.optional(),
        }),
        requestId: Joi.string()
          .custom(objectIdValidator, "Object Id validation")
          .required(),
      });

      const userObj = {
        approver: username,
        actionStatus,
        requestId,
        endDate,
      };

      const validationResult = userRequestBody.validate(userObj);
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

      const request = await collections.requestaccess.findOne({
        _id: ObjectId(requestId),
      });

      if (!request) {
        return res
          .status(404)
          .json({ flag: "error", message: "Request not found" });
      }

      let sample = {};

      sample.adGroup = await decrypt(request.adGroup);
      sample.commandType = await decrypt(request.commandType);
      sample.isAllowed = Boolean(await decrypt(request.isAllowed));
      sample.commandGroupName = await decrypt(request.commandGroupName);
      sample.isCommandGroupSelected = Boolean(
        await decrypt(request.isCommandGroupSelected)
      );
      sample.serverGroupName = await decrypt(request.serverGroupName);
      sample.isServerGroupSelected = Boolean(
        await decrypt(request.isServerGroupSelected)
      );
      sample.requestedBy = await decrypt(request.requestedBy);
      sample.status = await decrypt(request.status);
      sample.servers = await Promise.all(
        request.servers.map(async (server) => await decrypt(server))
      );
      sample.commands = await Promise.all(
        request.commands.map(async (command) => await decrypt(command))
      );
      if (request.isReadyForApproval !== undefined) {
        sample.isReadyForApproval = Boolean(
          await decrypt(request.isReadyForApproval)
        );
      }

      const currentLevelIndex = request.approversList.findIndex((level) => {
        const levelData = level[Object.keys(level)[0]];
        console.log(
          `Checking level: ${levelData.groupName} with status: ${levelData.levelStatus}`
        );

        return (
          levelData.levelStatus === "Pending" ||
          levelData.levelStatus === "ReadyToApprove"
        );
      });

      if (currentLevelIndex === -1) {
        return res.status(400).json({
          flag: "error",
          message: "No pending levels for this request",
        });
      }

      const currentLevelKey = Object.keys(
        request.approversList[currentLevelIndex]
      )[0];
      const currentLevelData =
        request.approversList[currentLevelIndex][currentLevelKey];

      const approver = currentLevelData.approvers.find(
        (appr) => appr.name === username
      );

      if (!approver) {
        return res.status(403).json({
          flag: "error",
          message: `You are not an approver for this level: ${currentLevelKey}`,
        });
      }

      if (approver.actionStatus !== "Pending") {
        return res.status(400).json({
          flag: "error",
          message: "Action already performed by this approver",
        });
      }

      approver.actionStatus = actionStatus;
      approver.actionTimestamp = new Date();
      approver.comments = comments ? comments : null;

      if (actionStatus === "denied") {
        for (let i = currentLevelIndex; i < request.approversList.length; i++) {
          const levelKey = Object.keys(request.approversList[i])[0];
          request.approversList[i][levelKey].levelStatus = "denied";
          request.approversList[i][levelKey].actionBy = username;
          request.approversList[i][levelKey].Timestamp = new Date();
        }
        request.status = await encrypt("denied");
      } else {
        currentLevelData.levelStatus = "assigned";
        currentLevelData.actionBy = username;
        currentLevelData.Timestamp = new Date();

        const nextLevelIndex = currentLevelIndex + 1;
        if (nextLevelIndex < request.approversList.length) {
          const nextLevelKey = Object.keys(
            request.approversList[nextLevelIndex]
          )[0];
          const nextLevelData =
            request.approversList[nextLevelIndex][nextLevelKey];

          if (
            nextLevelData.levelStatus === "Pending" &&
            currentLevelData.levelStatus === "assigned"
          ) {
            nextLevelData.levelStatus = "ReadyToApprove";
          }
        }

        if (currentLevelIndex === request.approversList.length - 1) {
          request.status = await encrypt("assigned");
        }
      }

      const updatedEndDate = new Date(endDate);

      await collections.requestaccess.findOneAndUpdate(
        { _id: ObjectId(requestId) },
        {
          $set: {
            endDate: updatedEndDate,
            approversList: request.approversList,
            status: request.status,
          }
        }
      );

      if ((await decrypt(request.status)) === "assigned") {
        let userADGroup = request;
        delete userADGroup._id;
        userADGroup.endDate = updatedEndDate;
        userADGroup.username = userADGroup?.requestedBy;
        userADGroup.isDeleted = await encrypt(false);
        console.log(userADGroup, "userADGroup to be inserted");

        await collections.users.insertOne(userADGroup);
      } else {
        console.log(`No insertion performed as status is "${sample.status}"`);
      }

      res.status(200).json({
        flag: "success",
        message: "Action successfully recorded",
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        flag: "error",
        error: error.message,
        message: "Internal server error",
      });
    }
  });

const cancelUserRequest = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;
      const { requestId } = reqbody;

      const userRequestBody = Joi.object({
        requestId: Joi.string()
          .custom(objectIdValidator, "Object Id validation")
          .required(),
      });

      const userObj = {
        requestId,
      };

      const validationResult = userRequestBody.validate(userObj);
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

      await collections.requestaccess.updateOne(
        { _id: ObjectId(requestId) },
        {
          $set: {
            status: await encrypt("cancelled"),
            updatedAt: new Date(),
          },
        }
      );

      res.status(200).json({
        flag: "success",
        message: "Request cancelled successfully",
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        flag: "error",
        error: error.message,
        message: "Internal server error",
      });
    }
  });

const getCommandGroupDetail = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;
      const { groupName } = reqbody;

      const configReqBodyValidation = Joi.object({
        groupName: Joi.string(),
      });

      const validationBody = { groupName };

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

      const resultSet = await collections.groupconfig.findOne({
        name: groupName,
      });

      res.status(responseCodes.SUCCESS).json({
        flag: "success",
        message: APIMessages.SUCCESS,
        data: resultSet ?? {},
      });
    } catch (error) {
      res.status(responseCodes.SERVER_ERROR).json({
        flag: "error",
        error: error.message,
        message: APIMessages.SERVER_ERROR,
      });
    }
  });

const deleteCommandGroup = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;
      const { groupId, username } = reqbody;
      const ip = req.ip || req.connection.remoteAddress;
      const reqBodyValidation = Joi.object({
        groupId: Joi.string()
          .custom(objectIdValidator, "Object Id validation")
          .required(),
        username: Joi.string().required(),
      });

      const validationBody = { groupId, username };

      const validationResult = reqBodyValidation.validate(validationBody);

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

      const resultSet = await collections.groupconfig.deleteOne({
        _id: ObjectId(groupId),
      });
      if (resultSet) {
        handleCreateLogFun(collections, {
          ip: ip,
          username: username,
          actionType: "Delete Command Group",
          module: "Command Group",
          prevValue: "",
          changes: "Record Deleted",
          updatedValue: `Command Group ${ObjectId(groupId)} deleted`,
        });
      }

      res.status(responseCodes.SUCCESS).json({
        flag: "success",
        message: APIMessages.SUCCESS,
        data: resultSet ?? {},
      });
    } catch (error) {
      res.status(responseCodes.SERVER_ERROR).json({
        flag: "error",
        error: error.message,
        message: APIMessages.SERVER_ERROR,
      });
    }
  });

const updateUsersServers = async (collections, group_name, newServerList) => {
  const usersToUpdate = await collections.users
    .find({
      serverGroupName: { $regex: new RegExp(group_name, "i") },
    })
    .toArray();

  
  for (const user of usersToUpdate) {
    const serverGroups = user.serverGroupName
      .split(",")
      .map((group) => group.trim());
    const currentServers = [...user.servers];
    const updatedServers = currentServers.map((server, index) => {
      // Check if the current index belongs to the updated server group
      const currentGroup = serverGroups[index];

      // If the current serverGroup matches the `group_name`, update the server
      if (currentGroup === group_name) {
        const serverIndex = index % newServerList.length;
        return newServerList[serverIndex];
      }

      return server;
    });

    await collections.users.updateOne(
      { _id: user._id },
      { $set: { servers: updatedServers } }
    );
  }
};

const getServerGroupDetails = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;
      const { groupName } = reqbody;

      const configReqBodyValidation = Joi.object({
        groupName: Joi.string(),
      });

      const validationBody = { groupName };

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

      const resultSet = await collections.server_group.findOne({
        group_name: groupName,
      });

      res.status(responseCodes.SUCCESS).json({
        flag: "success",
        message: APIMessages.SUCCESS,
        data: resultSet ?? {},
      });
    } catch (error) {
      res.status(responseCodes.SERVER_ERROR).json({
        flag: "error",
        error: error.message,
        message: APIMessages.SERVER_ERROR,
      });
    }
  });

const deleteServerGroup = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;
      const { groupId, username } = reqbody;
      const ip = req.ip || req.connection.remoteAddress;
      const reqBodyValidation = Joi.object({
        groupId: Joi.string()
          .custom(objectIdValidator, "Object Id validation")
          .required(),
        username: Joi.string().required(),
      });

      const validationBody = { groupId, username };

      const validationResult = reqBodyValidation.validate(validationBody);

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
      const resultSet = await collections.server_group.deleteOne({
        _id: ObjectId(groupId),
      });
      if (resultSet) {
        handleCreateLogFun(collections, {
          ip: ip,
          username: username,
          actionType: "Delete Server Group",
          module: "Server Group",
          prevValue: ObjectId(groupId),
          changes: "Record Deleted",
          updatedValue: `${ObjectId(groupId)} server group deleted`,
        });
      }
      res.status(responseCodes.SUCCESS).json({
        flag: "success",
        message: APIMessages.SUCCESS,
        data: resultSet ?? {},
      });
    } catch (error) {
      res.status(responseCodes.SERVER_ERROR).json({
        flag: "error",
        error: error.message,
        message: APIMessages.SERVER_ERROR,
      });
    }
  });

const checkServerAccess = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;
      const { username, hostname } = reqbody;
      let accessPresent = false;

      const configReqBodyValidation = Joi.object({
        username: Joi.string().optional(),
        hostname: Joi.string().optional(),
      });

      const validationBody = { username, hostname };

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

      const resultSet = await collections.users.find().toArray();
      for (const item of resultSet) {
        if (
          item.servers.includes(hostname) &&
          item.usernames.includes(username)
        ) {
          accessPresent = true;
        }
      }

      res.status(responseCodes.SUCCESS).json({
        flag: "success",
        message: APIMessages.SUCCESS,
        access: accessPresent,
      });
    } catch (error) {
      res.status(responseCodes.SERVER_ERROR).json({
        flag: "error",
        error: error.message,
        message: APIMessages.SERVER_ERROR,
      });
    }
  });

const executeCommand = async (req, res) =>
  // eslint-disable-next-line no-unused-vars
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;
      const { hostname, command } = reqbody;

      const configReqBodyValidation = Joi.object({
        command: Joi.string().required(),
        hostname: Joi.string().required(),
      });

      const validationBody = { hostname, command };

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

      const data = await executeRustCommand(validationBody);

      res.status(responseCodes.SUCCESS).json({
        flag: "success",
        message: APIMessages.SUCCESS,
        data: data?.data ?? {},
      });
    } catch (error) {
      res.status(responseCodes.SERVER_ERROR).json({
        flag: "error",
        error: error.message,
        message: APIMessages.SERVER_ERROR,
      });
    }
  });

const handleCreateNotification = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;
      const { message, type, username, command } = reqbody;
      const notificationRequestBody = Joi.object({
        message: Joi.string().required(),
        type: Joi.string().required(),
        username: Joi.string().required(),
      });

      const notificationObj = {
        message,
        type,
        username,
      };

      const validationResult =
        notificationRequestBody.validate(notificationObj);

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
      await collections.notifcation.insertOne({
        ...notificationObj,
        command: command ? command : "",
        readBy: [],
        date: new Date(),
      });

      res
        .status(responseCodes.SUCCESS)
        .json({ flag: "success", message: APIMessages.SUCCESS, data: [] });
    } catch (error) {
      res.status(responseCodes.SERVER_ERROR).json({
        flag: "error",
        error: error.message,
        message: APIMessages.SERVER_ERROR,
      });
    }
  });

const getNotifications = async (req, res) => {
  connectDatabase(async (collections) => {
    try {
      // Get the username from the request body or query (depending on the request method)
      const reqbody = req.method === "GET" ? req.query : req.body;
      const { username } = reqbody; 

      // Fetch all notifications sorted by date
      const resultSet = await collections.notifcation
        .find()
        .sort({ date: -1 })
        .toArray();

      // Count unread notifications where the current user's name is not in the `readBy` array
      const unreadCount = await collections.notifcation.countDocuments({
        readBy: { $ne: username },
      });
      const userlist = await collections.notifcation.distinct("username");

      res.status(responseCodes.SUCCESS).json({
        flag: "success",
        message: APIMessages.SUCCESS,
        data: {
          notifications: resultSet ?? [],
          unreadCount,
          userlist,
        },
      });
    } catch (error) {
      res.status(responseCodes.SERVER_ERROR).json({
        flag: "error",
        error: error.message,
        message: APIMessages.SERVER_ERROR,
      });
    }
  });
};

const notificationsMarkRead = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      // eslint-disable-next-line no-unused-vars
      const reqbody = req.method === "GET" ? req.query : req.body;
      const { username } = reqbody;
      // Find all notifications where `readBy` does not include the current username
       await collections.notifcation.updateMany(
        { readBy: { $ne: username } },
        {
          $addToSet: { readBy: username }, 
        }
      );

      res.status(responseCodes.SUCCESS).json({
        flag: "success",
        message: APIMessages.SUCCESS,
        data: {},
      });
    } catch (error) {
      res.status(responseCodes.SERVER_ERROR).json({
        flag: "error",
        error: error.message,
        message: APIMessages.SERVER_ERROR,
      });
    }
  });

const getAuditLogs = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;
      const limit = parseInt(reqbody.pageSize) || 10;
      const pageNo = parseInt(reqbody.pageNo - 1) || 0;
      const skip = pageNo * limit;
      const { searchUser } = reqbody;

      const searchFilter = {};
      const sortFilter = { createdAt: -1 };
      const configReqBodyValidation = Joi.object({
        limit: Joi.number().required(),
        pageNo: Joi.number().required(),
        searchUser: Joi.string(),
      });

      const validationBody = { limit, pageNo };

      if (searchUser) {
        validationBody["searchUser"] = searchUser;
      }

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

      if (reqbody.pageNo < 1) {
        return res.status(responseCodes.SUCCESS).json({
          flag: "error",
          statusCode: responseCodes.ERROR,
          error: "page no should be greater than 0",
        });
      }

      if (searchUser) {
        searchFilter["users"] = { $regex: new RegExp(searchUser, "i") };
      }

      const resultSet = await collections.audit_logs
        .find(searchFilter)
        .skip(skip)
        .limit(limit)
        .sort(sortFilter)
        .toArray();

      const totalCount = await collections.audit_logs.countDocuments(
        searchFilter
      );
      const totalPage = Math.ceil(totalCount / limit);

      const pagination = {
        limit,
        pageNo: pageNo + 1,
        rowCount: resultSet?.length || 0,
        totalPage: isNaN(totalPage) ? 1 : totalPage,
        totalCount,
      };

      res.status(responseCodes.SUCCESS).json({
        flag: "success",
        message: APIMessages.SUCCESS,
        pagination,
        data: resultSet ?? {},
      });
    } catch (error) {
      res.status(responseCodes.SERVER_ERROR).json({
        flag: "error",
        error: error.message,
        message: APIMessages.SERVER_ERROR,
      });
    }
  });

const handleCreateLog = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const ip = req.ip || req.connection.remoteAddress;
      const reqbody = req.method === "GET" ? req.query : req.body;
      const { username, module, actionType } = reqbody;
      const logRequestBody = Joi.object({
        module: Joi.string().required(),
        actionType: Joi.string().required(),
        username: Joi.string().required(),
      });

      const logObj = {
        username,
        module,
        actionType,
      };

      const validationResult = logRequestBody.validate(logObj);

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
      await collections.audit_logs.insertOne({
        ...logObj,
        ip,
        date: new Date(),
      });

      res
        .status(responseCodes.SUCCESS)
        .json({ flag: "success", message: APIMessages.SUCCESS, data: [] });
    } catch (error) {
      res.status(responseCodes.SERVER_ERROR).json({
        flag: "error",
        error: error.message,
        message: APIMessages.SERVER_ERROR,
      });
    }
  });

const getServerListForUser = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;
      const { username } = reqbody;

      const configReqBodyValidation = Joi.object({
        username: Joi.string().required(),
      });

      const validationBody = { username };
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

      const encryptedName = await encrypt(username);
      const users = await collections.users
        .find({
          usernames: { $in: [encryptedName] },
          endDate: { $gt: new Date() },
        })
        .toArray();

      for (const ad of users) {
        ad.adGroup = await decrypt(ad.adGroup);
        ad.commandType = await decrypt(ad.commandType);
        ad.isAllowed = await decrypt(ad.isAllowed);
        ad.commandGroupName = await decrypt(ad.commandGroupName);
        ad.isCommandGroupSelected =
          (await decrypt(ad.isCommandGroupSelected)) === "true";
        ad.serverGroupName = await decrypt(ad.serverGroupName);
        ad.isServerGroupSelected =
          (await decrypt(ad.isServerGroupSelected)) === "true";
        ad.isUsersModified = (await decrypt(ad.isUsersModified)) === "true";
        ad.servers = await Promise.all(
          ad.servers.map(async (server) => await decrypt(server))
        );
        ad.commands = await Promise.all(
          ad.commands.map(async (command) => await decrypt(command))
        );
        ad.usernames = await Promise.all(
          ad.usernames.map(async (usr) => await decrypt(usr))
        );
      }

      let allServers = [];

      for (const user of users) {
        if (user.isServerGroupSelected) {
          const serverNames = await Promise.all(
            user.serverGroupName.split(",").map((name) => encrypt(name.trim()))
          );

          const serverGroups = await collections.server_group
            .find({ group_name: { $in: serverNames } })
            .toArray();

          for (const group of serverGroups) {
            if (group.server) {
              const decryptedServer = await Promise.all(
                group.server.map(async (ser) => await decrypt(ser))
              );
              allServers = [...allServers, ...decryptedServer];
            }
          }
        } else {
          if (user.servers) {
            allServers = [...allServers, ...user.servers];
          }
        }
      }

      const uniqueServers = [...new Set(allServers)];

      res.status(responseCodes.SUCCESS).json({
        flag: "success",
        message: APIMessages.SUCCESS,
        servers: uniqueServers,
      });
    } catch (error) {
      res.status(responseCodes.SERVER_ERROR).json({
        flag: "error",
        error: error.message,
        message: APIMessages.SERVER_ERROR,
      });
    }
  });

module.exports = {
  connectDatabase,
  getFieldName,
  buildQuery,
  handleCreateLogFun,
  handleCreateNotificationFun,
  metric: (req, res) => getMetricsData(req, res),
  getAgents: (req, res) => getAgentsData(req, res),
  postMasterAgent: (req, res) => insertMasterAgent(req, res),
  deleteMasterAgent: (req, res) => deleteAgent(req, res),
  getMasterAgents: (req, res) => getMasterAgentsData(req, res),
  getAgentsInfo: (req, res) => getAgentInfo(req, res),
  health: (req, res) => handleApiResponse(req, res, getHealth),
  download: (req, res) => handleApiResponse(req, res, downloadFile),
  jobs: (req, res) => handleApiResponse(req, res, getJobs),
  pid: (req, res) => handleApiResponse(req, res, getPid),
  version: (req, res) => handleApiResponse(req, res, updateVersion),
  config: (req, res) => handleApiResponse(req, res, getConfig),
  start: (req, res) => handleApiResponse(req, res, putStart),
  stopjob: (req, res) => handleApiResponse(req, res, putStop),
  shutdown: (req, res) => handleApiResponse(req, res, putShutDown),
  restart: (req, res) => handleApiResponse(req, res, putRestart),
  postJob: (req, res) => handleApiResponse(req, res, postJob),
  deleteJob: (req, res) => handleApiResponse(req, res, deleteJob),
  updateJob: (req, res) => handleApiResponse(req, res, updateJob),
  updateLocalConfiguration: (req, res) =>
    handleApiResponse(req, res, updateLocalConfiguration),
  getJobDetails: (req, res) => handleApiResponse(req, res, getJobDetails),
  getApplicationLogs: (req, res) =>
    handleApiResponse(req, res, getApplicationLogs),
  getJobLogs: (req, res) => handleApiResponse(req, res, getJobLogs),
  startAgent: (req, res) => startAgentService(req.body, res),
  restartAgent: (req, res) => handleApiResponse(req, res, putRestartAgent),
  versionList: (req, res) => handleApiResponse(req, res, getVersions),
  downloadAgent: (req, res) => handleApiResponse(req, res, downloadAgent),
  syncAgentStatus: (req, res) => syncAgentStatus(req, res),
  syncCMDBData: (req, res) => syncCMDBData(req, res),
  getRegions: (req, res) => getRegions(req, res),
  getPlatforms: (req, res) => getPlatforms(req, res),
  getEnvironments: (req, res) => getEnvironments(req, res),
  getSids: (req, res) => getSids(req, res),
  getOStypes: (req, res) => getOStypes(req, res),
  getServiceNames: (req, res) => getServiceNames(req, res),
  getAgentVersions: (req, res) => getAgentVersions(req, res),
  validate: (req, res) => validateAgent(req, res),
  versions: (req, res) => manageVersions(req, res),
  deleteVersion: (req, res) => deleteVersion(req, res),
  permissionCheck: (req, res) => verifyUserPermissions(req, res),

  //bulk action
  bulkStartAgent: (req, res) => bulkStartAgent(req, res),
  bulkStopAgent: (req, res) => bulkStopAgent(req, res),
  bulkRestartAgent: (req, res) => bulkRestartAgent(req, res),
  bulkUpgradeAgent: (req, res) => bulkUpgradeAgent(req, res),

  // permission API

  deleteADGroup: (req, res) => deleteADGroup(req, res),
  deleteadGroup: (req, res) => deleteadGroup(req, res),
  getADGroupList: (req, res) => getADGroupList(req, res),
  getADGroupDetails: (req, res) => getADGroupDetails(req, res),
  createRequest: (req, res) => createRequest(req, res),
  getRequestList: (req, res) => getRequestList(req, res),
  getApprovalList: (req, res) => getApprovalList(req, res),
  handleRequestApproval: (req, res) => handleRequestApproval(req, res),
  encryptAllRequestAccess: (req, res) => encryptAllRequestAccess(req, res),
  getCommandGroupDetail: (req, res) => getCommandGroupDetail(req, res),
  deleteCommandGroup: (req, res) => deleteCommandGroup(req, res),
  checkServerAccess: (req, res) => checkServerAccess(req, res),
  executeCommand: (req, res) => executeCommand(req, res),
  getServerGroupDetails: (req, res) => getServerGroupDetails(req, res),
  deleteServerGroup: (req, res) => deleteServerGroup(req, res),
  handleCreateNotification: (req, res) => handleCreateNotification(req, res),
  getNotifications: (req, res) => getNotifications(req, res),
  handleCreateLog: (req, res) => handleCreateLog(req, res),
  getAuditLogs: (req, res) => getAuditLogs(req, res),
  getServerListForUser: (req, res) => getServerListForUser(req, res),
  notificationsMarkRead: (req, res) => notificationsMarkRead(req, res),
  cancelUserRequest: (req, res) => cancelUserRequest(req, res),
};
