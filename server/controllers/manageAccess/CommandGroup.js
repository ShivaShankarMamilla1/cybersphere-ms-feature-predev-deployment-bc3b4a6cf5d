/* eslint-disable no-unused-vars */
/* eslint-disable no-const-assign */
const responseCodes = require("../../utils/responseCodes");
const { ObjectId } = require("mongodb");
const Joi = require("joi");
const APIMessages = require("../../utils/messages");
const { objectIdValidator, getChangedFields } = require("../../utils/commonFunctions");
require("dotenv").config();
const { handleCreateLogFun } = require("../agentController");

const db = require("../../database/connection");
const { decrypt, encrypt } = require("../../utils/encryptFunctions");

const connectDatabase = async (callback) => {
  try {
    const collections = await db.connectToDatabase();
    return await callback(collections);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error occurred: ${error}`);
  }
};

const getCommandGroupList = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const searchFilter = {
        isDeleted: await encrypt(false)
      };
      const sortFilter = { name: 1 };

      const resultSet = await collections.groupconfig
        .find(searchFilter)
        .collation({ locale: "en", strength: 2 })
        .sort(sortFilter)
        .toArray();

      for (const r of resultSet) {
        r.name = await decrypt(r.name);
        r.createdBy = await decrypt(r.createdBy);
        r.updatedBy = await decrypt(r.updatedBy);
        r.description = await decrypt(r.description)
        r.isDeleted = await decrypt(r.isDeleted)
        r.commands = await Promise.all(
          r.commands.map(async (cmd) => {
            return {
              ...cmd,
              command: await decrypt(cmd.command),
              runAsRoot: (await decrypt(cmd.runAsRoot)) === 'true', 
              isSubDirectoryAllowed: (await decrypt(cmd.isSubDirectoryAllowed)) === 'true', 
              isExcluded: (await decrypt(cmd.isExcluded)) === 'true', 
              sudoers: cmd?.sudoers?.length ? await Promise.all(cmd.sudoers.map(sudoer => decrypt(sudoer))) : [],
              directory: cmd?.directory?.length ? await Promise.all(cmd.directory.map(dir => decrypt(dir))) : [],
              directoryGroup: cmd?.directoryGroup?.length ? await Promise.all(cmd.directoryGroup.map(dir => decrypt(dir))) : [],
              environment: cmd?.environment?.length ? await Promise.all(cmd.environment.map(env => decrypt(env))) : [],
              allowedSubUsers: cmd?.allowedSubUsers?.length ? await Promise.all(cmd.allowedSubUsers.map(user => decrypt(user))) : [],
              allowedSubUserGroup: cmd?.allowedSubUserGroup?.length ? await Promise.all(cmd.allowedSubUserGroup.map(group => decrypt(group))) : [],
              editMode: (await decrypt(cmd.editMode)) === 'true', 
            };
          })
        );

        if (r.exclude && r.exclude?.length) {
          r.exclude = await Promise.all(
            r.exclude.map(async (cmd) => {
              return {
                ...cmd,
                command: await decrypt(cmd.command),
                runAsRoot: (await decrypt(cmd.runAsRoot)) === 'true', 
                isSubDirectoryAllowed: (await decrypt(cmd.isSubDirectoryAllowed)) === 'true', 
                isExcluded: (await decrypt(cmd.isExcluded)) === 'true', 
                sudoers: cmd?.sudoers?.length ? await Promise.all(cmd.sudoers.map(sudoer => decrypt(sudoer))) : [],
                directory: cmd?.directory?.length ? await Promise.all(cmd.directory.map(dir => decrypt(dir))) : [],
                directoryGroup: cmd?.directoryGroup?.length ? await Promise.all(cmd.directoryGroup.map(dir => decrypt(dir))) : [],
                environment: cmd?.environment?.length ? await Promise.all(cmd.environment.map(env => decrypt(env))) : [],
                allowedSubUsers: cmd?.allowedSubUsers?.length ? await Promise.all(cmd.allowedSubUsers.map(user => decrypt(user))) : [],
                allowedSubUserGroup: cmd?.allowedSubUserGroup?.length ? await Promise.all(cmd.allowedSubUserGroup.map(group => decrypt(group))) : [],
                editMode: (await decrypt(cmd.editMode)) === 'true', 
              };
            })
          );
        }


        r.needsChangeRequest = await decrypt(r.needsChangeRequest);
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

const getCommandGroupDetail = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;
      let { groupName } = reqbody;

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
      groupName = await encrypt(groupName);
      const resultSet = await collections.groupconfig.findOne({
        name: groupName,
      });

      for (const r of resultSet) {
        r.name = await decrypt(r.name);
        r.createdBy = await decrypt(r.createdBy);
        r.updatedBy = await decrypt(r.updatedBy);
        r.commands = await Promise.all(
          r.commands.map(async (cmd) => {
            return {
              ...cmd,
              command: await decrypt(cmd.command),
              runAsRoot: (await decrypt(cmd.runAsRoot)) === 'true',
              isSubDirectoryAllowed: (await decrypt(cmd.isSubDirectoryAllowed)) === 'true',
              isExcluded: (await decrypt(cmd.isExcluded)) === 'true',
              sudoers: cmd?.sudoers?.length ? await Promise.all(cmd.sudoers.map(sudoer => decrypt(sudoer))) : [],
              directory: cmd?.directory?.length ? await Promise.all(cmd.directory.map(dir => decrypt(dir))) : [],
              environment: cmd?.environment?.length ? await Promise.all(cmd.environment.map(env => decrypt(env))) : [],
              allowedSubUsers: cmd?.allowedSubUsers?.length ? await Promise.all(cmd.allowedSubUsers.map(user => decrypt(user))) : [],
              allowedSubUserGroup: cmd?.allowedSubUserGroup?.length ? await Promise.all(cmd.allowedSubUserGroup.map(group => decrypt(group))) : [],
              editMode: (await decrypt(cmd.editMode)) === 'true',
            };
          })
        );

        if (r.exclude && r.exclude?.length) {
          r.exclude = await Promise.all(
            r.exclude.map(async (cmd) => {
              return {
                ...cmd,
                command: await decrypt(cmd.command),
                runAsRoot: (await decrypt(cmd.runAsRoot)) === 'true',
                isSubDirectoryAllowed: (await decrypt(cmd.isSubDirectoryAllowed)) === 'true',
                isExcluded: (await decrypt(cmd.isExcluded)) === 'true',
                sudoers: cmd?.sudoers?.length ? await Promise.all(cmd.sudoers.map(sudoer => decrypt(sudoer))) : [],
                directory: cmd?.directory?.length ? await Promise.all(cmd.directory.map(dir => decrypt(dir))) : [],
                environment: cmd?.environment?.length ? await Promise.all(cmd.environment.map(env => decrypt(env))) : [],
                allowedSubUsers: cmd?.allowedSubUsers?.length ? await Promise.all(cmd.allowedSubUsers.map(user => decrypt(user))) : [],
                allowedSubUserGroup: cmd?.allowedSubUserGroup?.length ? await Promise.all(cmd.allowedSubUserGroup.map(group => decrypt(group))) : [],
                editMode: (await decrypt(cmd.editMode)) === 'true',
              };
            })
          );
        }

        r.needsChangeRequest = await decrypt(r.needsChangeRequest);
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

const getGroupConfig = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;

      const limit = parseInt(reqbody.pageSize) || 10;
      const pageNo = parseInt(reqbody.pageNo - 1) || 0;
      const skip = pageNo * limit;

      //filter variables
      const { commands, commandGroup, createdBy, environment, allowedSubUserGroup, command_type, subUsers, searchTerm, fromDate, toDate } = reqbody;
      const falseValue = false;
      const searchFilter = {
        isDeleted: await encrypt(falseValue)
      };
      const sortFilter = { updatedAt: -1 };

      const configReqBodyValidation = Joi.object({
        limit: Joi.number().required(),
        pageNo: Joi.number().required(),
        commands: Joi.string(),
        allowedSubUserGroup: Joi.string(),
        command_type: Joi.string(),
        commandGroup: Joi.string(),
        createdBy: Joi.string(),
        environment: Joi.string(),
        subUsers: Joi.string(),
        searchTerm: Joi.string(),
        fromDate: Joi.date(),
        toDate: Joi.date(),
      });

      const validationBody = { limit, pageNo, commands, allowedSubUserGroup, command_type, commandGroup, createdBy, searchTerm, fromDate, toDate };

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

      if (commandGroup) {
        const commandGroupArray = commandGroup.split(",").map((user) => user.trim()).filter((user) => user !== "");
        const encryptedCommandGroup = await Promise.all(commandGroupArray?.map(async (user) => await encrypt(user)))
        searchFilter['name'] = { $in: encryptedCommandGroup }
      }

      if (commands) {
        const commandsArray = commands
          .split(",")
          .map((user) => user.trim())
          .filter((user) => user !== "");

        const encryptedCommands = await Promise.all(
          commandsArray.map(async (cmd) => await encrypt(cmd))
        );
        searchFilter["$or"] = [
          { "commands.command": { $in: encryptedCommands } },
          { "exclude.command": { $in: encryptedCommands } },
        ];
      }

      if (environment) {
        const environmentArray = environment
          .split(",")
          .map((env) => env.trim())
          .filter((env) => env !== "");

        const encryptedEnvironment = await Promise.all(
          environmentArray.map(async (env) => await encrypt((env)))
        );

        searchFilter["commands.environment"] = { $in: encryptedEnvironment };
      }

      if (subUsers) {
        const subUsersArray = subUsers
          .split(",")
          .map((env) => env.trim())
          .filter((env) => env !== "");

        const encryptedsubUsers = await Promise.all(
          subUsersArray.map(async (env) => await encrypt((env)))
        );

        searchFilter["commands.allowedSubUsers"] = { $in: encryptedsubUsers };
      }
      if (allowedSubUserGroup) {
        const allowedSubUserGroupArray = allowedSubUserGroup
          .split(",")
          .map((env) => env.trim())
          .filter((env) => env !== "");

        const encryptedSubUserGroup = await Promise.all(
          allowedSubUserGroupArray.map(async (env) => await encrypt((env)))
        );

        searchFilter["commands.allowedSubUserGroup"] = { $in: encryptedSubUserGroup };
      }
      if (command_type) {
        const commandTypes = command_type
          .split(",")
          .map((type) => type.trim())
          .filter((type) => type !== "");

        const commandTypeFilters = [];

        if (commandTypes.includes("restricted")) {
          commandTypeFilters.push({ "commands": { $exists: true, $ne: [] } });
        }

        if (commandTypes.includes("excluded")) {
          commandTypeFilters.push({ "exclude": { $exists: true, $ne: [] } });
        }
        if (commandTypeFilters.length > 0) {
          if (!searchFilter["$and"]) {
            searchFilter["$and"] = [];
          }
          searchFilter["$and"].push(...commandTypeFilters);
        }
      }

      if (fromDate && toDate) {
        const startOfDay = new Date(fromDate);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(toDate);
        endOfDay.setHours(23, 59, 59, 999);

        searchFilter["createdAt"] = {
          $gte: startOfDay,
          $lte: endOfDay
        };
      }


      if (createdBy) {
        const createdByArray = createdBy.split(",").map((user) => user.trim()).filter((user) => user !== "");
        const encryptedCreatedBy = await Promise.all(createdByArray?.map(async (user) => await encrypt(user)))
        searchFilter['createdBy'] = { $in: encryptedCreatedBy }
      }

      // Pagination logic only if limit is not 0
      let resultSet;
      if (limit > 0) {
        resultSet = await collections.groupconfig
          .find(searchFilter)
          .collation({ locale: "en", strength: 2 })
          .skip(skip)
          .limit(limit)
          .sort(sortFilter)
          .toArray();
      } else {
        // If no pagination is applied, return all records
        resultSet = await collections.groupconfig
          .find(searchFilter)
          .collation({ locale: "en", strength: 2 })
          .sort(sortFilter)
          .toArray();
      }

      for (const r of resultSet) {
        r.name = await decrypt(r.name);
        r.description = await decrypt(r.description)
        r.createdBy = await decrypt(r.createdBy);
        r.updatedBy = await decrypt(r.updatedBy);
        r.commands = await Promise.all(
          r.commands.map(async (cmd) => {
            return {
              ...cmd,
              command: await decrypt(cmd.command),
              runAsRoot: (await decrypt(cmd.runAsRoot)) === 'true',
              isSubDirectoryAllowed: (await decrypt(cmd.isSubDirectoryAllowed)) === 'true',
              isExcluded: (await decrypt(cmd.isExcluded)) === 'true',
              sudoers: cmd?.sudoers?.length ? await Promise.all(cmd.sudoers.map(sudoer => decrypt(sudoer))) : [],
              directory: cmd?.directory?.length ? await Promise.all(cmd.directory.map(dir => decrypt(dir))) : [],
              directoryGroup: cmd?.directoryGroup?.length ? await Promise.all(cmd.directoryGroup.map(dir => decrypt(dir))) : [],
              environment: cmd?.environment?.length ? await Promise.all(cmd.environment.map(env => decrypt(env))) : [],
              allowedSubUsers: cmd?.allowedSubUsers?.length ? await Promise.all(cmd.allowedSubUsers.map(user => decrypt(user))) : [],
              allowedSubUserGroup: cmd?.allowedSubUserGroup?.length ? await Promise.all(cmd.allowedSubUserGroup.map(group => decrypt(group))) : [],
              editMode: (await decrypt(cmd.editMode)) === 'true',
            };
          })
        );

        if (r.exclude && r.exclude?.length) {
          r.exclude = await Promise.all(
            r.exclude.map(async (cmd) => {
              return {
                ...cmd,
                command: await decrypt(cmd.command),
                runAsRoot: (await decrypt(cmd.runAsRoot)) === 'true', 
                isSubDirectoryAllowed: (await decrypt(cmd.isSubDirectoryAllowed)) === 'true', 
                isExcluded: (await decrypt(cmd.isExcluded)) === 'true', 
                sudoers: cmd?.sudoers?.length ? await Promise.all(cmd.sudoers.map(sudoer => decrypt(sudoer))) : [],
                directory: cmd?.directory?.length ? await Promise.all(cmd.directory.map(dir => decrypt(dir))) : [],
                directoryGroup: cmd?.directoryGroup?.length ? await Promise.all(cmd.directoryGroup.map(dir => decrypt(dir))) : [],
                environment: cmd?.environment?.length ? await Promise.all(cmd.environment.map(env => decrypt(env))) : [],
                allowedSubUsers: cmd?.allowedSubUsers?.length ? await Promise.all(cmd.allowedSubUsers.map(user => decrypt(user))) : [],
                allowedSubUserGroup: cmd?.allowedSubUserGroup?.length ? await Promise.all(cmd.allowedSubUserGroup.map(group => decrypt(group))) : [],
                editMode: (await decrypt(cmd.editMode)) === 'true', 
              };
            })
          );
        }
        r.needsChangeRequest = await decrypt(r.needsChangeRequest);

      }

      const totalCount = await collections.groupconfig.countDocuments(
        searchFilter
      );
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
        data: resultSet ?? {},
      });
    } catch (error) {
      console.log(error, "errorOccurred");
      res.status(responseCodes.SERVER_ERROR).json({
        flag: "error",
        error: error.message,
        message: APIMessages.SERVER_ERROR,
      });
    }
  });

const getServiceAccountUsers = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      let resultSet;

      resultSet = await collections.service_account_users
        .find({})
        .toArray();


      for (const r of resultSet) {
        if (r.allowedSubUsers && r.allowedSubUsers?.length) {
          r.allowedSubUsers = await Promise.all(
            r.allowedSubUsers.map(async (cmd) => await decrypt(cmd))
          );
        }
        if (r.groupConfiguration && r.groupConfiguration?.length) {
          r.groupConfiguration = await Promise.all(
            r.groupConfiguration.map(async (cmd) => await decrypt(cmd))
          );
        }
        if (r.allowedSudoers && r.allowedSudoers?.length) {
          r.allowedSudoers = await Promise.all(
            r.allowedSudoers.map(async (sudo) => await decrypt(sudo))
          );
        }
        if (r?.directory?.length > 0) {
          r.directory = await Promise.all(
            r.directory.map(async (dir) => await decrypt(dir))
          );
        }
      }


      res.status(responseCodes.SUCCESS).json({
        flag: "success",
        message: APIMessages.SUCCESS,
        data: resultSet?.length ? resultSet[0]?.allowedSubUsers : [],
        groupData: resultSet?.length ? resultSet[0]?.groupConfiguration : [],
        sudoerData: resultSet?.length ? resultSet[0]?.allowedSudoers : [],
        directoryData: resultSet?.length ? resultSet[0]?.directory : [],
        serviceAccountId: resultSet?.length ? resultSet[0]?._id : ""
      });
    } catch (error) {
      console.log(error, "errorOccurred");
      res.status(responseCodes.SERVER_ERROR).json({
        flag: "error",
        error: error.message,
        message: APIMessages.SERVER_ERROR,
      });
    }
  });

const handleServiceAccount = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;
      const { id, subUsers, username, ipAddress } = reqbody;
      const ip = ipAddress;

      const userRequestBody = Joi.object({
        allowedSubUsers: Joi.string().allow("").optional(), // Allow empty string or absence of value
        _id: Joi.string().custom(objectIdValidator, "Object Id validation"),
        username: Joi.string().required(),
      });

      const serviceAccObj = {
        allowedSubUsers: subUsers,
        username
      };

      const validationResult = userRequestBody.validate(serviceAccObj);

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

      let resultSet = [];
      serviceAccObj["allowedSubUsers"] = await Promise.all((serviceAccObj.allowedSubUsers ? serviceAccObj.allowedSubUsers.split(",") : []).map(async (user) => await encrypt(user)));

      serviceAccObj["username"] = await encrypt(username);

      if (id) {
        const existingRecord = await collections.service_account_users
          .findOne({ _id: ObjectId(id) }, { projection: { allowedSubUsers: 1, username: 1, updatedAt: 1 } });

        if (existingRecord.length === 0) {
          return res.status(responseCodes.SUCCESS).json({
            success: false,
            statusCode: responseCodes.ERROR,
            message: "No record with Id",
          });
        }
        existingRecord.allowedSubUsers = existingRecord?.allowedSubUsers ? await Promise.all(existingRecord.allowedSubUsers.map(async (usr) => await decrypt(usr))) : [];
        existingRecord.username = existingRecord?.username ? await decrypt(existingRecord.username) : "";

        serviceAccObj["updatedAt"] = new Date();
        resultSet = await collections.service_account_users.updateOne(
          { _id: ObjectId(id) },
          { $set: serviceAccObj },
          { returnDocument: "after" }
        );

        if (resultSet) {
          const updatedRecord = await collections.service_account_users
            .findOne({ _id: ObjectId(id) }, { projection: { allowedSubUsers: 1, username: 1, updatedAt: 1 } });

          updatedRecord.allowedSubUsers = await Promise.all(updatedRecord.allowedSubUsers.map(async (usr) => await decrypt(usr)));
          updatedRecord.username = await decrypt(updatedRecord.username);

          let changes = {};

          const changedFieldValues = getChangedFields(existingRecord, updatedRecord);

          handleCreateLogFun(collections, {
            ip: ip,
            username: username,
            actionType: "Updated Sub Users",
            module: "Service Account",
            prevValue: existingRecord.allowedSubUsers,
            changes: changes,
            fieldChanged: changedFieldValues,
            updatedValue: updatedRecord.allowedSubUsers,
          });
        }
      } else {
        serviceAccObj["createdAt"] = new Date();
        resultSet = await collections.service_account_users.insertOne(serviceAccObj);

        const updatedRecords = resultSet.ops;
        updatedRecords.allowedSubUsers = await Promise.all(updatedRecords.allowedSubUsers.map(async (usr) => await decrypt(usr)));
        updatedRecords.username = await decrypt(updatedRecords.username);

        const changedFieldValues = getChangedFields({}, updatedRecords);
        if (resultSet) {
          handleCreateLogFun(collections, {
            ip: ip,
            username: username,
            actionType: "Created Sub Users",
            module: "Service Account",
            prevValue: "",
            changes: "Record Added",
            fieldChanged: changedFieldValues,
            updatedValue: updatedRecords,
          });
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

const getSubUserGroup = async (req, res) =>
  connectDatabase(async (collections) => {
    try {

      let resultSet;

      resultSet = await collections.service_account_users
        .find({})
        .toArray();

      for (const r of resultSet) {
        if (r.groupConfiguration && r.groupConfiguration?.length) {
          r.groupConfiguration = await Promise.all(
            r.groupConfiguration.map(async (cmd) => await decrypt(cmd))
          );
        }
      }

      res.status(responseCodes.SUCCESS).json({
        flag: "success",
        message: APIMessages.SUCCESS,
        data: resultSet && resultSet.length ? resultSet[0]?.groupConfiguration : [],
        serviceAccountId: resultSet && resultSet.length ? resultSet[0]?._id : ""
      });

    } catch (error) {
      console.log(error, "errorOccurred");
      res.status(responseCodes.SERVER_ERROR).json({
        flag: "error",
        error: error.message,
        message: APIMessages.SERVER_ERROR,
      });
    }

  });

const handleSubUserGroup = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;
      const { id, groupconfig, username, ipAddress } = reqbody;
      const ip = ipAddress;

      const userRequestBody = Joi.object({
        groupconfig: Joi.string().allow("").optional(),
        id: Joi.string().custom(objectIdValidator, "Object Id validation"),
        username: Joi.string().required(),
      });

      const serviceAccObjValidate = {
        groupconfig: groupconfig,
        username,
        id
      };

      const validationResult = userRequestBody.validate(serviceAccObjValidate);

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

      let resultSet = [];
      const serviceAccObj = {}
      serviceAccObj["groupConfiguration"] = await Promise.all((groupconfig ? groupconfig.split(",") : []).map(async (user) => await encrypt(user)));
      serviceAccObj["username"] = await encrypt(username);

      if (id) {
        const existingRecord = await collections.service_account_users
          .findOne({ _id: ObjectId(id) }, { projection: { groupConfiguration: 1, username: 1, updatedAt: 1 } })

        if (existingRecord.length === 0) {
          return res.status(responseCodes.SUCCESS).json({
            success: false,
            statusCode: responseCodes.ERROR,
            message: "No record with Id",
          });
        }

        existingRecord.groupConfiguration = existingRecord.groupConfiguration ? await Promise.all(existingRecord.groupConfiguration.map(async (usr) => await decrypt(usr))) : [];
        existingRecord.username = existingRecord.username ? await decrypt(existingRecord.username) : "";

        serviceAccObj["updatedAt"] = new Date();
        resultSet = await collections.service_account_users.updateOne(
          { _id: ObjectId(id) },
          { $set: serviceAccObj },
          { returnDocument: "after" }
        );

        if (resultSet) {
          const updatedRecord = await collections.service_account_users
            .findOne({ _id: ObjectId(id) }, { projection: { groupConfiguration: 1, username: 1, updatedAt: 1 } })

          updatedRecord.groupConfiguration = await Promise.all(updatedRecord.groupConfiguration.map(async (usr) => await decrypt(usr)));
          updatedRecord.username = await decrypt(updatedRecord.username);


          let changes = {};

          const changedFieldValues = getChangedFields(existingRecord, updatedRecord);

          handleCreateLogFun(collections, {
            ip: ip,
            username: username,
            actionType: "Updated Sub User Group",
            module: "Service Account",
            prevValue: existingRecord.groupConfiguration,
            changes: changes,
            fieldChanged: changedFieldValues,
            updatedValue: updatedRecord.groupConfiguration,
          });
        }
      } else {

        serviceAccObj["createdAt"] = new Date();
        resultSet = await collections.service_account_users.insertOne(serviceAccObj);

        const updatedRecords = resultSet.ops;
        updatedRecords.groupConfiguration = await Promise.all(updatedRecords.groupConfiguration.map(async (usr) => await decrypt(usr)));
        updatedRecords.username = await decrypt(updatedRecords.username);


        if (resultSet) {
          handleCreateLogFun(collections, {
            ip: ip,
            username: username,
            actionType: "Created Sub User Group",
            module: "Service Account",
            prevValue: "",
            changes: "Record Added",
            fieldChanged: changedFieldValues,
            updatedValue: updatedRecords,
          });
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

const handleSudoer = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;
      const { id, sudoers, username, ipAddress, directory } = reqbody;
      const ip = ipAddress;

      const userRequestBody = Joi.object({
        allowedSudoers: Joi.string().allow("").required(),
        directory: Joi.string().allow("").required(),
        _id: Joi.string().custom(objectIdValidator, "Object Id validation"),
        username: Joi.string().required(),
      });

      const serviceAccObj = {
        allowedSudoers: sudoers,
        username,
        directory
      };

      const validationResult = userRequestBody.validate(serviceAccObj);

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

      let resultSet = [];
      serviceAccObj["allowedSudoers"] = await Promise.all((serviceAccObj.allowedSudoers ? serviceAccObj.allowedSudoers.split(",") : []).map(async (user) => await encrypt(user)));
      serviceAccObj["directory"] = await Promise.all((serviceAccObj.directory ? serviceAccObj.directory.split(",") : []).map(async (dir) => await encrypt(dir)));
      serviceAccObj["username"] = await encrypt(username);

      if (id) {
        const existingRecord = await collections.service_account_users
          .findOne({ _id: ObjectId(id) });

        if (existingRecord.length === 0) {
          return res.status(responseCodes.SUCCESS).json({
            success: false,
            statusCode: responseCodes.ERROR,
            message: "No record with Id",
          });
        }
        existingRecord.allowedSudoers = existingRecord.allowedSudoers ? await Promise.all((existingRecord.allowedSudoers).map(async (usr) => await decrypt(usr))) : [];
        existingRecord.directory = existingRecord.directory ? await Promise.all((existingRecord.directory).map(async (usr) => await decrypt(usr))) : [];

        serviceAccObj["updatedAt"] = new Date();
        resultSet = await collections.service_account_users.updateOne(
          { _id: ObjectId(id) },
          { $set: serviceAccObj },
          { returnDocument: "after" }
        );

        if (resultSet) {
          const updatedRecord = await collections.service_account_users
            .findOne({ _id: ObjectId(id) });

          updatedRecord.allowedSudoers = updatedRecord?.allowedSudoers ? await Promise.all(updatedRecord.allowedSudoers.map(async (usr) => await decrypt(usr))) : [];
          updatedRecord.directory = updatedRecord?.directory ? await Promise.all(updatedRecord.directory.map(async (usr) => await decrypt(usr))) : [];

          let changes = {};

          const changedFieldValues = getChangedFields(existingRecord, updatedRecord);

          handleCreateLogFun(collections, {
            ip: ip,
            username: username,
            actionType: "Updated Sudoers",
            module: "Service Account",
            prevValue: existingRecord,
            changes: changes,
            fieldChanged: changedFieldValues,
            updatedValue: updatedRecord,
          });
        }
      } else {
        serviceAccObj["createdAt"] = new Date();
        resultSet = await collections.service_account_users.insertOne(serviceAccObj);

        if (resultSet) {
          handleCreateLogFun(collections, {
            ip: ip,
            username: username,
            actionType: "Created Sudoers",
            module: "Service Account",
            prevValue: "",
            changes: "Record Added",
            updatedValue: resultSet.ops,
          });
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

const handleCommandGroup = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const {
        name,
        commands,
        username,
        description,
        ipAddress,
        exclude,
        needsChangeRequest,
      } = req.body;
      const ip = ipAddress;
      const requestBodySchema = Joi.object({
        name: Joi.string().required(),
        username: Joi.string().required(),
        commands: Joi.array().required(),
      });
      const falseValue = false;
      const validationResult = requestBodySchema.validate({
        name,
        commands,
        username,
      });
      if (validationResult.error) {
        return res.status(responseCodes.ERROR).json({
          success: false,
          statusCode: responseCodes.ERROR,
          message: validationResult.error.message,
        });
      }

      const GroupConfigData = {
        name: await encrypt(name),
        description: await encrypt(description),
        commands: await Promise.all(commands.map(async (cmd) => {
          const encryptedCommand = {
            ...cmd,
            command: await encrypt(cmd.command),
            runAsRoot: await encrypt(cmd.runAsRoot),
            isSubDirectoryAllowed: await encrypt(cmd.isSubDirectoryAllowed),
            isExcluded: await encrypt(cmd.isExcluded),
            recordEnabled: await encrypt(cmd.recordEnabled),
            sudoers: cmd?.sudoers?.length ? await Promise.all(cmd.sudoers.map(sudoer => encrypt(sudoer))) : [],
            directory: cmd?.directory?.length ? await Promise.all(cmd.directory.map(dir => encrypt(dir))) : [],
            directoryGroup: cmd?.directoryGroup?.length ? await Promise.all(cmd.directoryGroup.map(dir => encrypt(dir))) : [],
            environment: cmd?.environment?.length ? await Promise.all(cmd.environment.map(env => encrypt(env))) : [],
            allowedSubUsers: cmd?.allowedSubUsers?.length ? await Promise.all(cmd.allowedSubUsers.map(user => encrypt(user))) : [],
            allowedSubUserGroup: cmd?.allowedSubUserGroup?.length ? await Promise.all(cmd.allowedSubUserGroup.map(group => encrypt(group))) : [],
            editMode: await encrypt(cmd.editMode)
          }
          return encryptedCommand;
        })),
        exclude: exclude && exclude.length ? await Promise.all(
          exclude.map(async (cmd) => {
            // Encrypt each individual field of the exclude object
            const encryptedExclude = {
              ...cmd,
              command: await encrypt(cmd.command),
              runAsRoot: await encrypt(cmd.runAsRoot),
              isSubDirectoryAllowed: await encrypt(cmd.isSubDirectoryAllowed),
              isExcluded: await encrypt(cmd.isExcluded),
              recordEnabled: await encrypt(cmd.recordEnabled),
              sudoers: cmd?.sudoers?.length ? await Promise.all(cmd.sudoers.map(sudoer => encrypt(sudoer))) : [],
              directory: cmd?.directory?.length ? await Promise.all(cmd.directory.map(dir => encrypt(dir))) : [],
              directoryGroup: cmd?.directoryGroup?.length ? await Promise.all(cmd.directoryGroup.map(dir => encrypt(dir))) : [],
              environment: cmd?.environment?.length ? await Promise.all(cmd.environment.map(env => encrypt(env))) : [],
              allowedSubUsers: cmd?.allowedSubUsers?.length ? await Promise.all(cmd.allowedSubUsers.map(user => encrypt(user))) : [],
              allowedSubUserGroup: cmd?.allowedSubUserGroup?.length ? await Promise.all(cmd.allowedSubUserGroup.map(group => encrypt(group))) : [],
              editMode: await encrypt(cmd.editMode)
            };
            return encryptedExclude;
          })
        ) : [],

        needsChangeRequest: await encrypt(needsChangeRequest),
        isDeleted: await encrypt(falseValue),
      };

      let resultSet;
      if (req.body.groupId) {
        const { groupId } = req.body;

        const existingGroup = await collections.groupconfig.findOne({
          _id: ObjectId(groupId),
        });
        if (!existingGroup) {
          return res.status(responseCodes.NOT_FOUND).json({
            success: false,
            statusCode: responseCodes.NOT_FOUND,
            message: "Group not found",
          });
        }
        existingGroup.name = await decrypt(existingGroup.name);
        existingGroup.createdBy = await decrypt(existingGroup.createdBy);
        existingGroup.updatedBy = await decrypt(existingGroup.updatedBy);
        existingGroup.description = await decrypt(existingGroup.description)
        existingGroup.isDeleted = await decrypt(existingGroup.isDeleted)
        existingGroup.commands = await Promise.all(
          existingGroup.commands.map(async (cmd) => {
            return {
              ...cmd,
              command: await decrypt(cmd.command),
              runAsRoot: (await decrypt(cmd.runAsRoot)) === 'true', 
              isSubDirectoryAllowed: (await decrypt(cmd.isSubDirectoryAllowed)) === 'true', 
              isExcluded: (await decrypt(cmd.isExcluded)) === 'true', 
              recordEnabled: cmd?.recordEnabled?(await decrypt(cmd.recordEnabled)) === 'true':false, 
              sudoers: cmd?.sudoers?.length ? await Promise.all(cmd.sudoers.map(sudoer => decrypt(sudoer))) : [],
              directory: cmd?.directory?.length ? await Promise.all(cmd.directory.map(dir => decrypt(dir))) : [],
              directoryGroup: cmd?.directoryGroup?.length ? await Promise.all(cmd.directoryGroup.map(dir => decrypt(dir))) : [],
              environment: cmd?.environment?.length ? await Promise.all(cmd.environment.map(env => decrypt(env))) : [],
              allowedSubUsers: cmd?.allowedSubUsers?.length ? await Promise.all(cmd.allowedSubUsers.map(user => decrypt(user))) : [],
              allowedSubUserGroup: cmd?.allowedSubUserGroup?.length ? await Promise.all(cmd.allowedSubUserGroup.map(group => decrypt(group))) : [],
              editMode: (await decrypt(cmd.editMode)) === 'true', 
            };
          })
        );

        if (existingGroup.exclude && existingGroup.exclude?.length) {
          existingGroup.exclude = await Promise.all(
            existingGroup.exclude.map(async (cmd) => {
              return {
                ...cmd,
                command: await decrypt(cmd.command),
                runAsRoot: (await decrypt(cmd.runAsRoot)) === 'true', 
                isSubDirectoryAllowed: (await decrypt(cmd.isSubDirectoryAllowed)) === 'true', 
                isExcluded: (await decrypt(cmd.isExcluded)) === 'true', 
                recordEnabled: cmd?.recordEnabled?(await decrypt(cmd.recordEnabled)) === 'true':false, 
                sudoers: cmd?.sudoers?.length ? await Promise.all(cmd.sudoers.map(sudoer => decrypt(sudoer))) : [],
                directory: cmd?.directory?.length ? await Promise.all(cmd.directory.map(dir => decrypt(dir))) : [],
                directoryGroup: cmd?.directoryGroup?.length ? await Promise.all(cmd.directoryGroup.map(dir => decrypt(dir))) : [],
                environment: cmd?.environment?.length ? await Promise.all(cmd.environment.map(env => decrypt(env))) : [],
                allowedSubUsers: cmd?.allowedSubUsers?.length ? await Promise.all(cmd.allowedSubUsers.map(user => decrypt(user))) : [],
                allowedSubUserGroup: cmd?.allowedSubUserGroup?.length ? await Promise.all(cmd.allowedSubUserGroup.map(group => decrypt(group))) : [],
                editMode: (await decrypt(cmd.editMode)) === 'true', 
              };
            })
          );
        }
        existingGroup.needsChangeRequest = await decrypt(existingGroup.needsChangeRequest);

        GroupConfigData.updatedAt = new Date();
        (GroupConfigData.updatedBy = await encrypt(username)),
          (resultSet = await collections.groupconfig.updateOne(
            { _id: ObjectId(groupId) },
            { $set: GroupConfigData }
          ));
        if (resultSet) {
          const updatedRecord = await collections.groupconfig.findOne({ _id: ObjectId(groupId) })
          updatedRecord.name = await decrypt(updatedRecord.name);
          updatedRecord.createdBy = await decrypt(updatedRecord.createdBy);
          updatedRecord.updatedBy = await decrypt(updatedRecord.updatedBy);
          updatedRecord.description = await decrypt(updatedRecord.description)
          updatedRecord.isDeleted = await decrypt(updatedRecord.isDeleted)
          updatedRecord.commands = await Promise.all(
            updatedRecord.commands.map(async (cmd) => {
              return {
                ...cmd,
                command: await decrypt(cmd.command),
                runAsRoot: (await decrypt(cmd.runAsRoot)) === 'true', 
                isSubDirectoryAllowed: (await decrypt(cmd.isSubDirectoryAllowed)) === 'true', 
                isExcluded: (await decrypt(cmd.isExcluded)) === 'true', 
                recordEnabled: cmd?.recordEnabled?(await decrypt(cmd.recordEnabled)) === 'true':false, 
                sudoers: cmd?.sudoers?.length ? await Promise.all(cmd.sudoers.map(sudoer => decrypt(sudoer))) : [],
                directory: cmd?.directory?.length ? await Promise.all(cmd.directory.map(dir => decrypt(dir))) : [],
                directoryGroup: cmd?.directoryGroup?.length ? await Promise.all(cmd.directoryGroup.map(dir => decrypt(dir))) : [],
                environment: cmd?.environment?.length ? await Promise.all(cmd.environment.map(env => decrypt(env))) : [],
                allowedSubUsers: cmd?.allowedSubUsers?.length ? await Promise.all(cmd.allowedSubUsers.map(user => decrypt(user))) : [],
                allowedSubUserGroup: cmd?.allowedSubUserGroup?.length ? await Promise.all(cmd.allowedSubUserGroup.map(group => decrypt(group))) : [],
                editMode: (await decrypt(cmd.editMode)) === 'true', 
              };
            })
          );

          if (updatedRecord.exclude && updatedRecord.exclude?.length) {
            updatedRecord.exclude = await Promise.all(
              updatedRecord.exclude.map(async (cmd) => {
                return {
                  ...cmd,
                  command: await decrypt(cmd.command),
                  runAsRoot: (await decrypt(cmd.runAsRoot)) === 'true', 
                  isSubDirectoryAllowed: (await decrypt(cmd.isSubDirectoryAllowed)) === 'true', 
                  isExcluded: (await decrypt(cmd.isExcluded)) === 'true', 
                  recordEnabled: cmd?.recordEnabled?(await decrypt(cmd.recordEnabled)) === 'true':false, 
                  sudoers: cmd?.sudoers?.length ? await Promise.all(cmd.sudoers.map(sudoer => decrypt(sudoer))) : [],
                  directory: cmd?.directory?.length ? await Promise.all(cmd.directory.map(dir => decrypt(dir))) : [],
                  directoryGroup: cmd?.directoryGroup?.length ? await Promise.all(cmd.directoryGroup.map(dir => decrypt(dir))) : [],
                  environment: cmd?.environment?.length ? await Promise.all(cmd.environment.map(env => decrypt(env))) : [],
                  allowedSubUsers: cmd?.allowedSubUsers?.length ? await Promise.all(cmd.allowedSubUsers.map(user => decrypt(user))) : [],
                  allowedSubUserGroup: cmd?.allowedSubUserGroup?.length ? await Promise.all(cmd.allowedSubUserGroup.map(group => decrypt(group))) : [],
                  editMode: (await decrypt(cmd.editMode)) === 'true', 
                };
              })
            );
          }
          updatedRecord.needsChangeRequest = await decrypt(updatedRecord.needsChangeRequest);


          let changes = {};

          const changedFieldValues = getChangedFields(existingGroup, updatedRecord);

          handleCreateLogFun(collections, {
            ip: ip,
            username: username,
            actionType: "Update Command Group",
            module: "Command Group",
            prevValue: existingGroup,
            changes: changes,
            fieldChanged: changedFieldValues,
            updatedValue: updatedRecord,
          });
        }
      } else {
        GroupConfigData.createdAt = new Date();
        (GroupConfigData.createdBy = await encrypt(username));
        const exitUsers = await collections.groupconfig.find({ name: GroupConfigData.name }).toArray();
        console.log("exit users", exitUsers)
        if (exitUsers.length > 0) {
          for (const item of exitUsers) {
            const deleted = await decrypt(item.isDeleted);
            if (deleted === "false") {
              return res.status(responseCodes.ERROR).json({
                flag: "error",
                error: "Restricted Command Group already exists",
              });
            }
          }
        }
        (resultSet = await collections.groupconfig.insertOne(
          GroupConfigData
        ));

        const updatedRecords = resultSet?.ops[0];

        updatedRecords.name = await decrypt(updatedRecords.name);
        updatedRecords.createdBy = await decrypt(updatedRecords.createdBy);
        updatedRecords.updatedBy = await decrypt(updatedRecords.updatedBy);
        updatedRecords.description = await decrypt(updatedRecords.description)
        updatedRecords.isDeleted = await decrypt(updatedRecords.isDeleted)
        updatedRecords.commands = await Promise.all(
          updatedRecords.commands.map(async (cmd) => {
            return {
              ...cmd,
              command: await decrypt(cmd.command),
              runAsRoot: (await decrypt(cmd.runAsRoot)) === 'true', 
              isSubDirectoryAllowed: (await decrypt(cmd.isSubDirectoryAllowed)) === 'true', 
              isExcluded: (await decrypt(cmd.isExcluded)) === 'true', 
              recordEnabled: cmd?.recordEnabled?(await decrypt(cmd.recordEnabled)) === 'true':false, 
              sudoers: cmd?.sudoers?.length ? await Promise.all(cmd.sudoers.map(sudoer => decrypt(sudoer))) : [],
              directory: cmd?.directory?.length ? await Promise.all(cmd.directory.map(dir => decrypt(dir))) : [],
              environment: cmd?.environment?.length ? await Promise.all(cmd.environment.map(env => decrypt(env))) : [],
              allowedSubUsers: cmd?.allowedSubUsers?.length ? await Promise.all(cmd.allowedSubUsers.map(user => decrypt(user))) : [],
              allowedSubUserGroup: cmd?.allowedSubUserGroup?.length ? await Promise.all(cmd.allowedSubUserGroup.map(group => decrypt(group))) : [],
              editMode: (await decrypt(cmd.editMode)) === 'true', 
            };
          })
        );

        if (updatedRecords.exclude && updatedRecords.exclude?.length) {
          updatedRecords.exclude = await Promise.all(
            updatedRecords.exclude.map(async (cmd) => {
              return {
                ...cmd,
                command: await decrypt(cmd.command),
                runAsRoot: (await decrypt(cmd.runAsRoot)) === 'true', 
                isSubDirectoryAllowed: (await decrypt(cmd.isSubDirectoryAllowed)) === 'true',
                isExcluded: (await decrypt(cmd.isExcluded)) === 'true', 
                recordEnabled: cmd?.recordEnabled?(await decrypt(cmd.recordEnabled)) === 'true':false, 
                sudoers: cmd?.sudoers?.length ? await Promise.all(cmd.sudoers.map(sudoer => decrypt(sudoer))) : [],
                directory: cmd?.directory?.length ? await Promise.all(cmd.directory.map(dir => decrypt(dir))) : [],
                environment: cmd?.environment?.length ? await Promise.all(cmd.environment.map(env => decrypt(env))) : [],
                allowedSubUsers: cmd?.allowedSubUsers?.length ? await Promise.all(cmd.allowedSubUsers.map(user => decrypt(user))) : [],
                allowedSubUserGroup: cmd?.allowedSubUserGroup?.length ? await Promise.all(cmd.allowedSubUserGroup.map(group => decrypt(group))) : [],
                editMode: (await decrypt(cmd.editMode)) === 'true', 
              };
            })
          );
        }

        updatedRecords.needsChangeRequest = await decrypt(updatedRecords.needsChangeRequest);
        const changedFieldValues = getChangedFields({}, updatedRecords);

        if (resultSet) {
          handleCreateLogFun(collections, {
            ip: ip,
            username: username,
            actionType: "Create Command Group",
            module: "Command Group",
            prevValue: "",
            changes: "Record Added",
            fieldChanged: changedFieldValues,
            updatedValue: updatedRecords,
          });
        }
      }

      return res.status(responseCodes.SUCCESS).json({
        success: true,
        statusCode: responseCodes.SUCCESS,
        message: "Command group handled successfully",
        data: resultSet.ops,
      });
    } catch (error) {
      console.error(error);
      return res.status(responseCodes.SERVER_ERROR).json({
        success: false,
        statusCode: responseCodes.SERVER_ERROR,
        message: "An error occurred while handling the command group",
      });
    }
  });

const deleteCommandGroup = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;
      const { groupId, username, ipAddress } = reqbody;
      const ip = ipAddress;
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
      const resultSet = await collections.groupconfig.updateOne(
        { _id: ObjectId(groupId) },
        {
          $set: { isDeleted: await encrypt(trueValue) },
        }
      );

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


  const getAllCommandsList = async (req, res) =>
    connectDatabase(async (collections) => {
      try {
        const resultSet = await collections.groupconfig
          .find(
            { isDeleted: await encrypt(false) },
            {
              projection: { commands: 1, exclude: 1, _id: 0 },
            }
          )
          .toArray();  
          
      const allData = await Promise.all(
        resultSet.map(async (item) => {
          const commandsData = Array.isArray(item.commands)
            ? await Promise.all(
              item.commands.map(async (cmd) => {
                return {
                  ...cmd,
                  command: await decrypt(cmd.command),
                  runAsRoot: (await decrypt(cmd.runAsRoot)) === "true",
                  isSubDirectoryAllowed:
                    (await decrypt(cmd.isSubDirectoryAllowed)) === "true",
                  isExcluded: (await decrypt(cmd.isExcluded)) === "true",
                  sudoers: cmd?.sudoers?.length
                    ? await Promise.all(cmd.sudoers.map((sudoer) => decrypt(sudoer)))
                    : [],
                  directory: cmd?.directory?.length
                    ? await Promise.all(cmd.directory.map((dir) => decrypt(dir)))
                    : [],
                  environment: cmd?.environment?.length
                    ? await Promise.all(cmd.environment.map((env) => decrypt(env)))
                    : [],
                  allowedSubUsers: cmd?.allowedSubUsers?.length
                    ? await Promise.all(cmd.allowedSubUsers.map((user) => decrypt(user)))
                    : [],
                  allowedSubUserGroup: cmd?.allowedSubUserGroup?.length
                    ? await Promise.all(cmd.allowedSubUserGroup.map((group) => decrypt(group)))
                    : [],
                  editMode: (await decrypt(cmd.editMode)) === "true", 
                };
              })
            )
            : [];

          const excludeData = Array.isArray(item.exclude)
            ? await Promise.all(
              item.exclude.map(async (excl) => {
                return {
                  ...excl,
                  command: await decrypt(excl.command),
                  runAsRoot: (await decrypt(excl.runAsRoot)) === "true", 
                  isSubDirectoryAllowed:
                    (await decrypt(excl.isSubDirectoryAllowed)) === "true",
                  isExcluded: (await decrypt(excl.isExcluded)) === "true", 
                  sudoers: excl?.sudoers?.length
                    ? await Promise.all(excl.sudoers.map((sudoer) => decrypt(sudoer)))
                    : [],
                  directory: excl?.directory?.length
                    ? await Promise.all(excl.directory.map((dir) => decrypt(dir)))
                    : [],
                  environment: excl?.environment?.length
                    ? await Promise.all(excl.environment.map((env) => decrypt(env)))
                    : [],
                  allowedSubUsers: excl?.allowedSubUsers?.length
                    ? await Promise.all(excl.allowedSubUsers.map((user) => decrypt(user)))
                    : [],
                  allowedSubUserGroup: excl?.allowedSubUserGroup?.length
                    ? await Promise.all(excl.allowedSubUserGroup.map((group) => decrypt(group)))
                    : [],
                  editMode: (await decrypt(excl.editMode)) === "true",
                };
              })
            )
            : [];

          return [...commandsData, ...excludeData];
        })
      );

      const uniqueCommands = [
        ...new Set(allData.flat().map((item) => item.command)),
      ];

      const commandsArray = [
        ...new Set(
          uniqueCommands
            .map((command) => command.split(","))
            .flat()
        ),
      ];

      res.status(responseCodes.SUCCESS).json({
        flag: "success",
        message: APIMessages.SUCCESS,
        data: commandsArray,
      });
    } catch (error) {
      console.error("Error in getAllCommandsList:", error);
      res.status(responseCodes.SERVER_ERROR).json({
        flag: "error",
        error: error.message,
        message: APIMessages.SERVER_ERROR,
      });
    }
  });



module.exports = {
  connectDatabase,
  getCommandGroupList: (req, res) => getCommandGroupList(req, res),
  getCommandGroupDetail: (req, res) => getCommandGroupDetail(req, res),
  handleCommandGroup: (req, res) => handleCommandGroup(req, res),
  deleteCommandGroup: (req, res) => deleteCommandGroup(req, res),
  getGroupConfig: (req, res) => getGroupConfig(req, res),
  getServiceAccountUsers: (req, res) => getServiceAccountUsers(req, res),
  handleServiceAccount: (req, res) => handleServiceAccount(req, res),
  getAllCommandsList: (req, res) => getAllCommandsList(req, res),
  getSubUserGroup: (req, res) => getSubUserGroup(req, res),
  handleSubUserGroup: (req, res) => handleSubUserGroup(req, res),
  handleSudoer: (req, res) => handleSudoer(req, res)
};
