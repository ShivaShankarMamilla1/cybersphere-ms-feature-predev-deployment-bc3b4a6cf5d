/* eslint-disable no-unused-vars */
/* eslint-disable no-const-assign */
const responseCodes = require("../../utils/responseCodes");
const { ObjectId } = require("mongodb");
const Joi = require("joi");
const APIMessages = require("../../utils/messages");
const {
  objectIdValidator,
  generateReqNumber,
  getChangedFields,
} = require("../../utils/commonFunctions");
require("dotenv").config();
const db = require("../../database/connection");
const { decrypt, encrypt } = require("../../utils/encryptFunctions");

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

const connectDatabase = async (callback) => {
  try {
    const collections = await db.connectToDatabase();
    return await callback(collections);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error occurred: ${error}`);
  }
};

const handleADGroup = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;
      const {
        isCommandGroupSelected,
        commandGroupName,
        isServerGroupSelected,
        serverGroupName,
        commands,
        usernames,
        userAccessId,
        servers,
        loggedInUser,
        ipAddress,
      } = reqbody;
      const isUserBlocked = reqbody?.isUserBlocked ?? false;
      const ip = ipAddress;
      const userObj = {};
      const falseValue = false;
      let resultSet = [];
      let { commandType } = reqbody;
      let { startDate, endDate } = reqbody;

      const userRequestBody = Joi.object({
        usernames: Joi.string().required(),
        isServerGroupSelected: Joi.boolean().required(),
        serverGroupName: Joi.string().allow(""),
        servers: Joi.string().required().allow(""),
        isCommandGroupSelected: Joi.boolean().required(),
        commandGroupName: Joi.string().allow(""),
        commandType: Joi.string().allow(""),
        commands: Joi.string().required().allow(""),
        startDate: Joi.date().required(),
        endDate: Joi.date().required(),
        isUserBlocked: Joi.boolean().required(),
      });

      const reqBodyValidateObj = {
        usernames,
        isServerGroupSelected,
        serverGroupName,
        servers,
        isCommandGroupSelected,
        commandGroupName,
        commandType,
        commands,
        startDate,
        endDate,
        isUserBlocked,
      };

      if (isCommandGroupSelected === false && !commands) {
        return res.status(responseCodes.SUCCESS).json({
          flag: "error",
          error: "Commands are required",
        });
      }
      if (isCommandGroupSelected === false && commandType === "") {
        return res.status(responseCodes.SUCCESS).json({
          flag: "error",
          error: "Command Type is required",
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
        reqBodyValidateObj["servers"] = servers;
      }

      if (commands && !isCommandGroupSelected) {
        reqBodyValidateObj["commands"] = commands;
      }

      const validationResult = userRequestBody.validate(reqBodyValidateObj);

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

      if (isCommandGroupSelected) {
        let cGrp = commandGroupName?.split(",");

        cGrp = await Promise.all(cGrp.map((name) => encrypt(name.trim())));

        const commandGroupsList = await collections.groupconfig
          .find({
            name: { $in: cGrp },
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
          })
          .toArray();

        const allServerGroupRef = serverGroupsList.map((item) => item._id);

        userObj["serverGroupsRef"] = allServerGroupRef;
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

      let encryptedUsernames = usernames.split(",");
      encryptedUsernames = encryptedUsernames
        ? await Promise.all(
          encryptedUsernames?.map(async (usr) => await encrypt(usr))
        )
        : [];

      userObj["isServerGroupSelected"] = await encrypt(isServerGroupSelected);

      userObj["servers"] = userObj?.servers
        ? await Promise.all(
          userObj?.servers?.map(async (server) => await encrypt(server))
        )
        : [];

      userObj["isCommandGroupSelected"] = await encrypt(isCommandGroupSelected);

      userObj["commandType"] = await encrypt(commandType);
      userObj["commands"] = userObj?.commands
        ? await Promise.all(
          userObj?.commands?.map(async (command) => await encrypt(command))
        )
        : [];
      userObj["startDate"] = startDate;
      userObj["endDate"] = endDate;
      userObj["isUserBlocked"] = await encrypt(isUserBlocked);
      userObj["isDeleted"] = await encrypt(falseValue);

      if (userAccessId) {
        const existingRecord = await collections.users.findOne({
          _id: ObjectId(userAccessId),
        });

        console.log(existingRecord, "existingRecord");

        if (existingRecord.length === 0) {
          return res.status(responseCodes.SUCCESS).json({
            success: false,
            statusCode: responseCodes.ERROR,
            message: "No record with Id",
          });
        }

        existingRecord.isServerGroupSelected =
          (await decrypt(existingRecord.isServerGroupSelected)) === "true";
        existingRecord.isDeleted =
          (await decrypt(existingRecord.isDeleted)) === "true";
        const serverGroupsList = await collections.server_group
          .find({
            _id: { $in: existingRecord?.serverGroupsRef ?? [] },
          })
          .toArray();

        const serverGrpNames = serverGroupsList.map(
          (group) => group.group_name
        );
        existingRecord.serverGroupName = await Promise.all(
          serverGrpNames.map(async (server) => await decrypt(server))
        );
        existingRecord.serverGroupName =
          existingRecord.serverGroupName?.join(",");

        existingRecord.servers = existingRecord.servers
          ? await Promise.all(
            existingRecord.servers.map(
              async (server) => await decrypt(server)
            )
          )
          : [];
        existingRecord.servers = existingRecord.servers.join(",");
        existingRecord.isCommandGroupSelected =
          (await decrypt(existingRecord.isCommandGroupSelected)) === "true";
        existingRecord.commandType = await decrypt(existingRecord.commandType);
        existingRecord.commands = existingRecord.commands
          ? await Promise.all(
            existingRecord.commands.map(
              async (command) => await decrypt(command)
            )
          )
          : [];
        existingRecord.commands = existingRecord.commands.join(",");
        const commandGroupsList = await collections.groupconfig
          .find({
            _id: { $in: existingRecord?.commandGroupsRef ?? [] },
          })
          .toArray();

        const commandGrpName = commandGroupsList.map((group) => group.name);
        existingRecord.commandGroupName = await Promise.all(
          commandGrpName.map(async (cmdname) => await decrypt(cmdname))
        );
        existingRecord.commandGroupName =
          existingRecord.commandGroupName.join(",");

        existingRecord.username = await decrypt(existingRecord.username);

        existingRecord.isUserBlocked =
          (await decrypt(existingRecord.isUserBlocked)) === "true";

        userObj["updatedAt"] = new Date();

        for (const user of encryptedUsernames) {
          userObj["username"] = user;
          delete userObj?._id;

          userObj["accessUpdatedBy"] = loggedInUser;
          resultSet = await collections.users.updateOne(
            { _id: ObjectId(userAccessId) },
            {
              $set: {
                ...userObj,
                updatedAt: new Date(),
                accessUpdatedBy: loggedInUser,
              },
            }
          );

          if (resultSet) {
            const updatedRecord = await collections.users.findOne({
              _id: ObjectId(userAccessId),
            });
            let changes = {};

            console.log(updatedRecord, "updatedRecord");

            updatedRecord.isServerGroupSelected =
              (await decrypt(updatedRecord.isServerGroupSelected)) === "true";
            updatedRecord.isDeleted =
              (await decrypt(updatedRecord.isDeleted)) === "true";
            const serverGroupsList = await collections.server_group
              .find({
                _id: { $in: updatedRecord?.serverGroupsRef ?? [] },
              })
              .toArray();

            const serverGrpNames = serverGroupsList.map(
              (group) => group.group_name
            );
            updatedRecord.serverGroupName = await Promise.all(
              serverGrpNames.map(async (server) => await decrypt(server))
            );
            updatedRecord.serverGroupName =
              updatedRecord.serverGroupName?.join(",");

            updatedRecord.servers = updatedRecord.servers
              ? await Promise.all(
                updatedRecord.servers.map(
                  async (server) => await decrypt(server)
                )
              )
              : [];
            updatedRecord.servers = updatedRecord.servers.join(",");
            updatedRecord.isCommandGroupSelected =
              (await decrypt(updatedRecord.isCommandGroupSelected)) === "true";
            updatedRecord.commandType = await decrypt(
              updatedRecord.commandType
            );
            updatedRecord.commands = updatedRecord.commands
              ? await Promise.all(
                updatedRecord.commands.map(
                  async (command) => await decrypt(command)
                )
              )
              : [];
            updatedRecord.commands = updatedRecord.commands.join(",");
            const commandGroupsList = await collections.groupconfig
              .find({
                _id: { $in: updatedRecord?.commandGroupsRef ?? [] },
              })
              .toArray();

            const commandGrpName = commandGroupsList.map((group) => group.name);
            updatedRecord.commandGroupName = await Promise.all(
              commandGrpName.map(async (cmdname) => await decrypt(cmdname))
            );
            updatedRecord.commandGroupName =
              updatedRecord.commandGroupName.join(",");

            updatedRecord.username = await decrypt(updatedRecord.username);

            updatedRecord.isUserBlocked =
              (await decrypt(updatedRecord.isUserBlocked)) === "true";

            const changedFieldValues = getChangedFields(
              existingRecord,
              updatedRecord
            );

            handleCreateLogFun(collections, {
              username: loggedInUser,
              ip: ip,
              actionType: "Updated Access",
              module: "Access Management",
              prevValue: existingRecord,
              changes: changes,
              fieldChanged: changedFieldValues,
              updatedValue: updatedRecord,
            });

            console.log(resultSet.ops, "updatedRecord2")
          }
        }
      } else {
        userObj["createdAt"] = new Date();

        const exitUsers = await collections.users
          .find({
            username: { $in: encryptedUsernames },
            isDeleted: await encrypt(false),
          })
          .toArray();

        if (exitUsers.length > 0) {
          return res.status(responseCodes.ERROR).json({
            flag: "error",
            error: " User already exists",
          });
        }

        for (const user of encryptedUsernames) {
          userObj["username"] = user;
          delete userObj?._id;
          userObj["ReqNumber"] = generateReqNumber();
          resultSet = await collections.users.insertOne(userObj);

          const updatedRecords = resultSet?.ops[0];

          updatedRecords.isServerGroupSelected =
            (await decrypt(updatedRecords.isServerGroupSelected)) === "true";
          updatedRecords.isDeleted =
            (await decrypt(updatedRecords.isDeleted)) === "true";
          const serverGroupsList = await collections.server_group
            .find({
              _id: { $in: updatedRecords?.serverGroupsRef ?? [] },
            })
            .toArray();

          const serverGrpNames = serverGroupsList.map(
            (group) => group.group_name
          );
          updatedRecords.serverGroupName = await Promise.all(
            serverGrpNames.map(async (server) => await decrypt(server))
          );
          updatedRecords.serverGroupName =
            updatedRecords.serverGroupName?.join(",");

          updatedRecords.servers = updatedRecords.servers
            ? await Promise.all(
              updatedRecords.servers.map(
                async (server) => await decrypt(server)
              )
            )
            : [];
          updatedRecords.servers = updatedRecords.servers.join(",");
          updatedRecords.isCommandGroupSelected =
            (await decrypt(updatedRecords.isCommandGroupSelected)) === "true";
          updatedRecords.commandType = await decrypt(
            updatedRecords.commandType
          );
          updatedRecords.commands = updatedRecords.commands
            ? await Promise.all(
              updatedRecords.commands.map(
                async (command) => await decrypt(command)
              )
            )
            : [];
          updatedRecords.commands = updatedRecords.commands.join(",");
          const commandGroupsList = await collections.groupconfig
            .find({
              _id: { $in: updatedRecords?.commandGroupsRef ?? [] },
            })
            .toArray();

          const commandGrpName = commandGroupsList.map((group) => group.name);
          updatedRecords.commandGroupName = await Promise.all(
            commandGrpName.map(async (cmdname) => await decrypt(cmdname))
          );
          updatedRecords.commandGroupName =
            updatedRecords.commandGroupName.join(",");

          updatedRecords.username = await decrypt(updatedRecords.username);

          updatedRecords.isUserBlocked =
            (await decrypt(updatedRecords.isUserBlocked)) === "true";
          const changedFieldValues = getChangedFields({}, updatedRecords);
          if (updatedRecords) {
            handleCreateLogFun(collections, {
              username: loggedInUser,
              ip: ip,
              actionType: "Created Access",
              module: "Access Management",
              prevValue: "",
              changes: "Record Added Successfully",
              fieldChanged: changedFieldValues,
              updatedValue: updatedRecords,
            });
          }
        }
      }

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

const addADGroup = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;
      const { groupname, l1approvers, l2approvers, userAccessId } = reqbody;

      const falseValue = false;
      let resultSet = [];

      const userRequestBody = Joi.object({
        groupname: Joi.string().required(),
        l1approvers: Joi.string().optional(),
      });

      const reqBodyValidateObj = {
        groupname,
        l1approvers,
      };

      const validationResult = userRequestBody.validate(reqBodyValidateObj);

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

      if (userAccessId) {
        const existingRecord = await collections.adgroups
          .find({ _id: ObjectId(userAccessId), isDeleted: falseValue })
          .project()
          .toArray();

        if (existingRecord.length === 0) {
          return res.status(responseCodes.SUCCESS).json({
            success: false,
            statusCode: responseCodes.ERROR,
            message: "No record with Id",
          });
        }

        if (existingRecord.length > 0) {
          const editObj = {
            group: groupname,
            isDeleted: falseValue,
          };

          if (l1approvers) {
            const approverFilter = {
              $or: l1approvers.split(",").map((username) => ({
                jnjMSUsername: { $regex: `^${username}$`, $options: "i" },
              })),
            };

            const approverDetails = await collections.iamusers
              .find(approverFilter, {
                projection: { name: 1, jnjMSUsername: 1, email: 1, sub: 1 },
              })
              .toArray();

            editObj.l1 = {
              approvers: approverDetails.map((approver) => ({
                name: approver?.name ?? "",
                jnjMSUsername: approver?.jnjMSUsername.toLowerCase() ?? "",
                email: approver?.email ?? "",
                sub: approver?.sub ?? "",
              })),
            };
          } else {
            editObj.l1 = null;
          }

          if (l2approvers) {
            const approverFilter = {
              $or: l2approvers.split(",").map((username) => ({
                jnjMSUsername: { $regex: `^${username}$`, $options: "i" },
              })),
            };

            const approverDetails = await collections.iamusers
              .find(approverFilter, {
                projection: { name: 1, jnjMSUsername: 1, email: 1, sub: 1 },
              })
              .toArray();

            editObj.l2 = {
              approvers: approverDetails.map((approver) => ({
                name: approver?.name ?? "",
                jnjMSUsername: approver?.jnjMSUsername.toLowerCase() ?? "",
                email: approver?.email ?? "",
                sub: approver?.sub ?? "",
              })),
            };
          } else {
            editObj.l2 = null;
          }

          resultSet = await collections.adgroups.updateOne(
            { _id: ObjectId(userAccessId), isDeleted: falseValue },
            { $set: editObj },
            { upsert: true, returnDocument: "after" }
          );
        }
      } else {
        const exitUsers = await collections.adgroups
          .find({ group: groupname, isDeleted: falseValue })
          .toArray();

        if (exitUsers.length > 0) {
          return res.status(responseCodes.ERROR).json({
            flag: "error",
            error: "AD Group already exists",
          });
        }

        const l1approverFilter = {
          $or: l1approvers.split(",").map((username) => ({
            jnjMSUsername: { $regex: `^${username}$`, $options: "i" },
          })),
        };

        const l1approverDetails = await collections.iamusers
          .find(l1approverFilter, {
            projection: { name: 1, jnjMSUsername: 1, email: 1, sub: 1 },
          })
          .toArray();

        let l2approverDetails = [];
        if (l2approvers) {
          const l2approverFilter = {
            $or: l2approvers.split(",").map((username) => ({
              jnjMSUsername: { $regex: `^${username}$`, $options: "i" },
            })),
          };

          l2approverDetails = await collections.iamusers
            .find(l2approverFilter, {
              projection: { name: 1, jnjMSUsername: 1, email: 1, sub: 1 },
            })
            .toArray();
        }

        const userObj = {
          group: groupname,
          l1: l1approvers
            ? {
              approvers: l1approverDetails.map((approver) => ({
                name: approver?.name ?? "",
                jnjMSUsername: approver?.jnjMSUsername.toLowerCase() ?? "",
                email: approver?.email ?? "",
                sub: approver?.sub ?? "",
              })),
            }
            : null,
          l2: l2approvers
            ? {
              approvers: l2approverDetails.map((approver) => ({
                name: approver?.name ?? "",
                jnjMSUsername: approver?.jnjMSUsername.toLowerCase() ?? "",
                email: approver?.email ?? "",
                sub: approver?.sub ?? "",
              })),
            }
            : null,
          isDeleted: falseValue,
        };

        resultSet = await collections.adgroups.insertOne(userObj);
      }

      res.status(responseCodes.SUCCESS).json({
        success: true,
        statusCode: responseCodes.SUCCESS,
        message: APIMessages.SUCCESS,
        data: resultSet.ops,
      });
    } catch (e) {
      console.error(e);
      res.status(responseCodes.SERVER_ERROR).json({
        success: false,
        statusCode: responseCodes.SERVER_ERROR,
        message: APIMessages.SERVER_ERROR,
      });
    }
  });

const getUsersAccessList = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;
      const limit = parseInt(reqbody.pageSize) || 10;
      const pageNo = parseInt(reqbody.pageNo - 1) || 0;
      const skip = pageNo * limit;
      //filter variables
      const {
        username,
        serverGroup,
        commandGroup,
        fromDate,
        toDate,
        searchTerm,
      } = reqbody;
      const falseValue = false;
      const searchFilter = {
        isDeleted: await encrypt(falseValue),
      };
      const sortFilter = { createdAt: -1 };
      let status = reqbody?.status ?? "Active";
      const searchOrCondtions = [];
      const serverGrpFilter = {
        isDeleted: await encrypt(falseValue),
      };
      const serverGrpOrCondtions = [];
      const commandGrpFilter = {
        isDeleted: await encrypt(falseValue),
      };
      const commandGrpOrCondtions = [];

      const configReqBodyValidation = Joi.object({
        limit: Joi.number().required(),
        pageNo: Joi.number().required(),
        username: Joi.string(),
        status: Joi.string(),
        serverGroup: Joi.string(),
        commandGroup: Joi.string(),
        fromDate: Joi.date(),
        toDate: Joi.date(),
        searchTerm: Joi.string(),
      });

      const validationBody = {
        limit,
        pageNo,
        username,
        status,
        serverGroup,
        commandGroup,
        fromDate,
        toDate,
        searchTerm,
      };

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

      if (searchTerm) {
        const encryptedSearchTerm = await encrypt(searchTerm);

        serverGrpOrCondtions.push({
          group_name: { $regex: new RegExp(encryptedSearchTerm, "i") },
        });
        serverGrpOrCondtions.push({ server: { $in: [encryptedSearchTerm] } });

        serverGrpFilter["$or"] = serverGrpOrCondtions;
        const serverGrpData = await collections.server_group
          .find(serverGrpFilter)
          .toArray();
        let serverGrpIds = serverGrpData?.map((v) => Object(v?._id));
        searchOrCondtions.push({
          serverGroupsRef: { $in: serverGrpIds },
          isDeleted: await encrypt(falseValue),
        });

        commandGrpOrCondtions.push({
          name: { $regex: new RegExp(encryptedSearchTerm, "i") },
        });
        const commandsArray = searchTerm
          .split(",")
          .map((user) => user.trim())
          .filter((user) => user !== "");

        const commandsWithRunAsRoot = commandsArray.map((command) => ({
          command,
          runAsRoot: true,
        }));

        const commandsWithRunAsRootFalse = commandsArray.map((command) => ({
          command,
          runAsRoot: false,
        }));

        const combinedCommands = [
          ...commandsWithRunAsRoot,
          ...commandsWithRunAsRootFalse,
        ];

        const encryptedCommands = await Promise.all(
          combinedCommands.map(
            async (cmd) => await encrypt(JSON.stringify(cmd))
          )
        );

        commandGrpOrCondtions.push({ commands: { $in: encryptedCommands } });

        commandGrpFilter["$or"] = commandGrpOrCondtions;
        const commandGrpData = await collections.groupconfig
          .find(commandGrpFilter)
          .toArray();
        let commandGrpIds = commandGrpData?.map((v) => Object(v?._id));
        searchOrCondtions.push({
          commandGroupsRef: { $in: commandGrpIds },
          isDeleted: await encrypt(falseValue),
        });

        searchOrCondtions.push({
          commandType: { $regex: new RegExp(encryptedSearchTerm, "i") },
        });
        searchOrCondtions.push({
          username: { $regex: new RegExp(encryptedSearchTerm, "i") },
        });
        searchOrCondtions.push({ commands: { $in: [encryptedSearchTerm] } });
        searchOrCondtions.push({ servers: { $in: [encryptedSearchTerm] } });
      }

      if (reqbody.pageNo < 1) {
        return res.status(responseCodes.SUCCESS).json({
          flag: "error",
          statusCode: responseCodes.ERROR,
          error: "page no should be greater than 0",
        });
      }

      if (username) {
        const usernameArray = username
          .split(",")
          .map((user) => user.trim())
          .filter((user) => user !== "");
        const encryptedUsernames = await Promise.all(
          usernameArray?.map(async (user) => await encrypt(user))
        );
        searchFilter["username"] = { $in: encryptedUsernames };
      }

      if (serverGroup) {
        const serverGroupArray = serverGroup
          .split(",")
          .map((srvr) => srvr.trim())
          .filter((srvr) => srvr !== "");
        const encryptedserverGroup = await Promise.all(
          serverGroupArray?.map(async (srvr) => await encrypt(srvr))
        );
        const serverGroupsList = await collections.server_group
          .find({
            group_name: { $in: encryptedserverGroup },
          })
          .toArray();

        searchFilter["serverGroupsRef"] = {
          $in: serverGroupsList?.map((grp) => grp._id),
        };
      }

      if (commandGroup) {
        const commandGroupArray = commandGroup
          .split(",")
          .map((cmd) => cmd.trim())
          .filter((cmd) => cmd !== "");
        const encryptedCommandGroup = await Promise.all(
          commandGroupArray?.map(async (cmd) => await encrypt(cmd))
        );
        const commandGroupsList = await collections.groupconfig
          .find({
            name: { $in: encryptedCommandGroup },
          })
          .toArray();

        searchFilter["commandGroupsRef"] = {
          $in: commandGroupsList?.map((grp) => grp._id),
        };
      }

      if (status) {
        switch (status) {
          case "Active":
            searchFilter["endDate"] = { $gt: new Date() };
            break;

          case "Inactive":
            searchFilter["endDate"] = { $lt: new Date() };
            break;

          default:
            break;
        }
      }

      if (fromDate && toDate) {
        const startOfDay = new Date(fromDate);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(toDate);
        endOfDay.setHours(23, 59, 59, 999);

        searchFilter["startDate"] = { $gte: startOfDay };
        searchFilter["endDate"] = { $lte: endOfDay };
      }

      if (searchOrCondtions.length > 0) {
        searchFilter["$or"] = searchOrCondtions;
      }

      const resultSet = await collections.users
        .find(searchFilter)
        .skip(skip)
        .limit(limit)
        .sort(sortFilter)
        .toArray();

      const uniqueUsernames = Array.from(
        new Set(
          await Promise.all(
            resultSet.map(async (item) =>
              (await decrypt(item.username)).toLowerCase()
            )
          )
        )
      );

      let requestorsDetails = [];
      if (uniqueUsernames.length > 0) {
        const requestorFilters = {
          $or: uniqueUsernames.map((username) => ({
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

      const serData = await collections.agents
        .find(
          { hostname: { $in: uniqueServers } },
          { projection: { cmdb: 1, hostname: 1 } }
        )
        .toArray();

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

      const currentDate = new Date();
      for (const ad of resultSet) {
        ad.isServerGroupSelected =
          (await decrypt(ad.isServerGroupSelected)) === "true";
        ad.isDeleted = (await decrypt(ad.isDeleted)) === "true";
        const serverGroupsList = await collections.server_group
          .find({
            _id: { $in: ad?.serverGroupsRef ?? [] },
          })
          .toArray();

        const serverGrpNames = serverGroupsList.map(
          (group) => group.group_name
        );
        ad.serverGroupName = await Promise.all(
          serverGrpNames.map(async (server) => await decrypt(server))
        );
        ad.serverGroupName = ad.serverGroupName?.join(",");

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

        ad.servers = await Promise.all(
          ad.servers.map(async (server) => await decrypt(server))
        );
        ad.servers = ad.servers.join(",");
        ad.serverDetails = ad.servers
          ? ad.servers
            .split(",")
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
        ad.isCommandGroupSelected =
          (await decrypt(ad.isCommandGroupSelected)) === "true";
        ad.commandType = await decrypt(ad.commandType);
        ad.commands = await Promise.all(
          ad.commands.map(async (command) => await decrypt(command))
        );
        ad.commands = ad.commands.join(",");
        ad.commandDetails = ad.commands
          ? ad.commands
            .split(",")
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
        const commandGroupsList = await collections.groupconfig
          .find({
            _id: { $in: ad?.commandGroupsRef ?? [] },
          })
          .toArray();
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

        const commandGrpName = commandGroupsList.map((group) => group.name);
        ad.commandGroupName = await Promise.all(
          commandGrpName.map(async (cmdname) => await decrypt(cmdname))
        );
        ad.commandGroupName = ad.commandGroupName.join(",");

        ad.username = await decrypt(ad.username);
        ad.reason = await decrypt(ad.reason);
        ad.userDetails = requestorsDetails.find(
          (e) => e?.jnjMSUsername?.toLowerCase() === ad?.username?.toLowerCase()
        );
        ad.status = currentDate < ad?.endDate ? "Active" : "Inactive";
        ad.isUserBlocked = (await decrypt(ad.isUserBlocked)) === "true";
      }

      const totalCount = await collections.users.countDocuments(searchFilter);
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

const deleteADGroup = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;
      const { groupId, username, ipAddress } = reqbody;

      const reqBodyValidation = Joi.object({
        groupId: Joi.string()
          .custom(objectIdValidator, "Object Id validation")
          .required(),
        username: Joi.string().required(),
        ipAddress: Joi.string().required(),
      });

      const validationBody = { groupId, username, ipAddress };
      const ip = ipAddress;
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

      const trueValue = true;
      const resultSet = await collections.users.updateOne(
        { _id: ObjectId(groupId) },
        {
          $set: { isDeleted: await encrypt(trueValue) },
        }
      );

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

      for (const ad of resultSet) {
        ad.group = await decrypt(ad.group);
        ad.usernames = await decrypt(ad.usernames);
        ad.isGroupUsed = await decrypt(ad.isGroupUsed);
        ad.approverDetails = await decrypt(ad.approverDetails);
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

const getADGroupDetails = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;
      let { adGroupName } = reqbody;

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
      adGroupName = await encrypt(adGroupName);
      const resultSet = await collections.adgroups.findOne({
        group: adGroupName,
      });

      resultSet.group = await decrypt(resultSet.group);
      resultSet.usernames = (await decrypt(resultSet.usernames))?.split(",");
      resultSet.isGroupUsed = await decrypt(resultSet.isGroupUsed);
      resultSet.approverDetails = JSON.parse(
        await decrypt(resultSet.approverDetails)
      );

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

const getFilterValue = async (req, res) =>
  connectDatabase(async (collections) => {
    const reqbody = req.method === "GET" ? req.query : req.body;

    const {
      region,
      serviceName,
      platform,
      environment,
      sid,
      ci,
      pkg,
      recentFilter,
    } = reqbody;

    try {
      // Function to split comma-separated strings into arrays
      const parseToArray = (value) => {
        return value ? value.split(",").map((item) => item.trim()) : [];
      };

      // Convert comma-separated strings to arrays
      const regionArray = parseToArray(region);
      const serviceNameArray = parseToArray(serviceName);
      const platformArray = parseToArray(platform);
      const environmentArray = parseToArray(environment);
      const sidArray = parseToArray(sid);
      const ciArray = parseToArray(ci);
      const pkgArray = parseToArray(pkg);

      // Build the filter object
      const filter = {};

      if (regionArray.length) filter["cmdb.slRegion"] = { $in: regionArray };
      if (serviceNameArray.length)
        filter["cmdb.slName"] = { $in: serviceNameArray };
      if (platformArray.length)
        filter["cmdb.slPlatform"] = { $in: platformArray };
      if (environmentArray.length)
        filter["cmdb.ciSapNameEnv"] = { $in: environmentArray };
      if (sidArray.length) filter["cmdb.ciSapNameSid"] = { $in: sidArray };
      if (ciArray.length) filter["cmdb.ciSapName"] = { $in: ciArray };
      if (pkgArray.length) filter["cmdb.sapVirtualPkg"] = { $in: pkgArray };

      // Fetch distinct values for each field with filters applied
      const slRegion = await collections.cybersphere_servers.distinct(
        `cmdb.slRegion`,
        recentFilter === "region" ? {} : filter
      );
      const slName = await collections.cybersphere_servers.distinct(
        `cmdb.slName`,
        recentFilter === "serviceName" ? {} : filter
      );
      const slPlatform = await collections.cybersphere_servers.distinct(
        `cmdb.slPlatform`,
        recentFilter === "platform" ? {} : filter
      );
      const ciSapNameEnv = await collections.cybersphere_servers.distinct(
        `cmdb.ciSapNameEnv`,
        recentFilter === "environment" ? {} : filter
      );
      const ciSapNameSid = await collections.cybersphere_servers.distinct(
        `cmdb.ciSapNameSid`,
        recentFilter === "sid" ? {} : filter
      );
      const ciSapName = await collections.cybersphere_servers.distinct(
        `cmdb.ciSapName`,
        recentFilter === "ci" ? {} : filter
      );
      const sapVirtualPkg = await collections.cybersphere_servers.distinct(
        `cmdb.sapVirtualPkg`,
        recentFilter === "pkg" ? {} : filter
      );

      const resObj = {
        region: slRegion,
        serviceName: slName,
        platform: slPlatform,
        environment: ciSapNameEnv,
        sid: ciSapNameSid,
        ci: ciSapName,
        virtualpkg: sapVirtualPkg,
      };

      res.status(responseCodes.SUCCESS).json({
        flag: "success",
        message: APIMessages.SUCCESS,
        data: resObj ?? {},
      });
    } catch (error) {
      res.status(responseCodes.SERVER_ERROR).json({
        flag: "error",
        error: error.message,
        message: APIMessages.SERVER_ERROR,
      });
    }
  });



const getAgentServerList = async (req, res) => 
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;
      const { region, serviceName, platform, environment, sid, pkg, ci, page = 1, pageSize = 100 } = reqbody;

      const searchFilter = {};

      if (region?.length > 0) {
        searchFilter["cmdb.slRegion"] = { $in: region };
      }

      if (serviceName?.length > 0) {
        searchFilter["cmdb.slName"] = { $in: serviceName };
      }

      if (platform?.length > 0) {
        searchFilter["cmdb.slPlatform"] = { $in: platform };
      }

      if (environment?.length > 0) {
        searchFilter["cmdb.ciSapNameEnv"] = { $in: environment };
      }

      if (sid?.length > 0) {
        searchFilter["cmdb.ciSapNameSid"] = { $in: sid };
      }

      if (pkg?.length > 0) {
        searchFilter["cmdb.sapVirtualPkg"] = { $in: pkg };
      }

      if (ci?.length > 0) {
        searchFilter["cmdb.ciSapName"] = { $in: ci };
      }

      const skip = (page - 1) * pageSize;
      const limit = parseInt(pageSize);

      const agentResult = await collections.cybersphere_servers
        .find(searchFilter, {
          projection: { cmdb: 1, hostname: 1, _id: 0 },
        })
        .skip(skip)
        .limit(limit)
        .toArray();

      const totalRecords = await collections.cybersphere_servers.countDocuments(searchFilter);

      res.status(responseCodes.SUCCESS).json({
        flag: "success",
        message: APIMessages.SUCCESS,
        data: agentResult ?? [],
        totalRecords,
      });
    } catch (error) {
      res.status(responseCodes.SERVER_ERROR).json({
        flag: "error",
        error: error.message,
        message: APIMessages.SERVER_ERROR,
      });
    }
  });

const getAdGroupIAM = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const falseValue = false;
      const groupDetails = await collections.adgroups
        .find({ isDeleted: falseValue })
        .toArray();

      res.status(responseCodes.SUCCESS).json({
        flag: "success",
        message: APIMessages.SUCCESS,
        data: groupDetails ?? [],
      });
    } catch (error) {
      res.status(responseCodes.SERVER_ERROR).json({
        flag: "error",
        error: error.message,
        message: APIMessages.SERVER_ERROR,
      });
    }
  });
const deleteGroupById = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;
      const { groupId, username, ipAddress } = reqbody;

      const reqBodyValidation = Joi.object({
        groupId: Joi.string()
          .custom(objectIdValidator, "Object Id validation")
          .required(),
        username: Joi.string().required(),
        ipAddress: Joi.string().required(),
      });

      const validationBody = { groupId, username, ipAddress };
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

      const trueValue = true;
      const resultSet = await collections.adgroups.updateOne(
        { _id: ObjectId(groupId) },
        {
          $set: { isDeleted: trueValue },
        }
      );

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
const getIAMUsers = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const jnjusernames = await collections.iamusers
        .find({}, { projection: { jnjMSUsername: 1 } })
        .toArray();

      const resObj = {
        usernames: jnjusernames
          .filter((item) => item.jnjMSUsername)
          .map((item) => item.jnjMSUsername.toLowerCase()),
      };

      res.status(responseCodes.SUCCESS).json({
        flag: "success",
        message: APIMessages.SUCCESS,
        data: resObj ?? {},
      });
    } catch (error) {
      res.status(responseCodes.SERVER_ERROR).json({
        flag: "error",
        error: error.message,
        message: APIMessages.SERVER_ERROR,
      });
    }
  });

const getAdGroupById = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;

      const limit = parseInt(reqbody.pageSize) || 10;
      const pageNo = parseInt(reqbody.pageNo - 1) || 0;
      let resultSet;
      const skip = pageNo * limit;
      const falseValue = false;
      const sortFilter = { updatedAt: -1 };
      if (reqbody.pageNo < 1) {
        return res.status(responseCodes.SUCCESS).json({
          flag: "error",
          statusCode: responseCodes.ERROR,
          error: "page no should be greater than 0",
        });
      }

      if (limit > 0) {
        resultSet = await collections.adgroups
          .find({ isDeleted: falseValue })
          .skip(skip)
          .limit(limit)
          .collation({ locale: "en", strength: 2 })
          .sort(sortFilter)
          .toArray();
      } else {
        // If no pagination is applied, return all records
        resultSet = await collections.adgroups
          .find({ isDeleted: falseValue })
          .sort(sortFilter)
          .toArray();
      }
      const totalCount = await collections.adgroups.countDocuments({
        isDeleted: falseValue,
      });
      const totalPage = limit > 0 ? Math.ceil(totalCount / limit) : 1;

      const pagination = {
        limit: limit || totalCount, // If no limit, return total count
        pageNo: limit > 0 ? pageNo + 1 : 1,
        rowCount: resultSet?.length || 0,
        totalPage: isNaN(totalPage) ? 1 : totalPage,
        totalCount,
      };

      res.status(responseCodes.SUCCESS).json({
        flag: "success",
        message: APIMessages.SUCCESS,
        pagination,
        data: resultSet ?? [],
      });
    } catch (error) {
      res.status(responseCodes.SERVER_ERROR).json({
        flag: "error",
        error: error.message,
        message: APIMessages.SERVER_ERROR,
      });
    }
  });

const getUsernamesList = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const falseValue = false;
      const resultSet = await collections.users
        .find(
          { isDeleted: await encrypt(falseValue) },
          {
            projection: { username: 1, hostname: 1, _id: 0 },
          }
        )
        .toArray();

      const usernames = await Promise.all(
        resultSet.map(async (user) => {
          return await decrypt(user.username);
        })
      );

      res.status(responseCodes.SUCCESS).json({
        flag: "success",
        message: APIMessages.SUCCESS,
        data: usernames ?? {},
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
  handleADGroup: (req, res) => handleADGroup(req, res),
  getUsersAccessList: (req, res) => getUsersAccessList(req, res),
  deleteADGroup: (req, res) => deleteADGroup(req, res),
  getADGroupList: (req, res) => getADGroupList(req, res),
  getADGroupDetails: (req, res) => getADGroupDetails(req, res),
  getFilterValue: (req, res) => getFilterValue(req, res),
  getAgentServerList: (req, res) => getAgentServerList(req, res),
  getAdGroupIAM: (req, res) => getAdGroupIAM(req, res),
  getUsernamesList: (req, res) => getUsernamesList(req, res),
  getAdGroupById: (req, res) => getAdGroupById(req, res),
  addADGroup: (req, res) => addADGroup(req, res),
  deleteGroupById: (req, res) => deleteGroupById(req, res),
  getIAMUsers: (req, res) => getIAMUsers(req, res),
};
