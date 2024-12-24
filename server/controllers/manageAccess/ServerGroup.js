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
const { list } = require("mongodb/lib/gridfs/grid_store");

const connectDatabase = async (callback) => {
  try {
    const collections = await db.connectToDatabase();
    return await callback(collections);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error occurred: ${error}`);
  }
};

const getServerGroup = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;

      const limit = parseInt(reqbody.pageSize) || 10;
      const pageNo = parseInt(reqbody.pageNo - 1) || 0;
      const skip = pageNo * limit;

      //filter variables
      const { servers, serverGroup, createdBy, adGroup, searchTerm, toDate, fromDate } = reqbody;
      const falseValue = false;
      const searchFilter = {
        isDeleted: await encrypt(falseValue)
      };
      const sortFilter = { updatedAt: -1 };

      const configReqBodyValidation = Joi.object({
        limit: Joi.number().required(),
        pageNo: Joi.number().required(),
        servers: Joi.string(),
        serverGroup: Joi.string(),
        createdBy: Joi.string(),
        adGroup: Joi.string(),
        searchTerm: Joi.string(),
        fromDate: Joi.date(),
        toDate: Joi.date(),
      });

      const validationBody = { limit, pageNo, servers, serverGroup, createdBy, searchTerm, toDate, fromDate };

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

      if (serverGroup) {
        const serverGroupArray = serverGroup.split(",").map((user) => user.trim()).filter((user) => user !== "");
        const encryptedServerGroup = await Promise.all(serverGroupArray?.map(async (user) => await encrypt(user)))
        searchFilter['group_name'] = { $in: encryptedServerGroup }
      }

      if (servers) {
        const serversArray = servers.split(",").map((user) => user.trim()).filter((user) => user !== "");
        const encryptedServers = await Promise.all(serversArray?.map(async (user) => await encrypt(user)))
        searchFilter['server'] = { $in: encryptedServers }
      }

      if (adGroup) {
        const adGroupArray = adGroup.split(",").map((grp) => grp.trim()).filter((grp) => grp !== "");
        // const encryptedAdGroup = await Promise.all(adGroupArray?.map(async (grp) => await encrypt(grp)))
        searchFilter['approverAdGroup'] = { $in: adGroupArray }
      }

      if (createdBy) {
        const createdByArray = createdBy.split(",").map((user) => user.trim()).filter((user) => user !== "");
        const encryptedCreatedBy = await Promise.all(createdByArray?.map(async (user) => await encrypt(user)))
        searchFilter['createdBy'] = { $in: encryptedCreatedBy }
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

      // Pagination logic only if limit is not 0
      let resultSet;
      if (limit > 0) {
        resultSet = await collections.server_group
          .find(searchFilter)
          .skip(skip)
          .limit(limit)
          .collation({ locale: "en", strength: 2 })
          .sort(sortFilter)
          .toArray();
      } else {
        // If no pagination is applied, return all records
        resultSet = await collections.server_group
          .find(searchFilter)
          .sort(sortFilter)
          .toArray();
      }

      for (const r of resultSet) {
        r.group_name = await decrypt(r.group_name);
        r.createdBy = await decrypt(r.createdBy);
        r.updatedBy = await decrypt(r.updatedBy);
        r.server = await Promise.all(r.server.map(async (server) => await decrypt(server)))
        r.isDeleted = await decrypt(r.isDeleted)
      }

      const totalCount = await collections.server_group.countDocuments(
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

const getServerGroupList = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;
      const {
        region,
        serviceName,
        platform,
        environment,
        sid } = reqbody;

      const searchFilter = {
        isDeleted: await encrypt(false)
      }

      if (region?.length > 0) {
        searchFilter['cmdb.slRegion'] = { $in: region };
      }

      if (serviceName?.length > 0) {
        searchFilter['cmdb.slName'] = { $in: serviceName };
      }

      if (platform?.length > 0) {
        searchFilter['cmdb.slPlatform'] = { $in: platform };
      }

      if (environment?.length > 0) {
        searchFilter['cmdb.ciSapNameEnv'] = { $in: environment };
      }

      if (sid?.length > 0) {
        searchFilter['cmdb.ciSapNameSid'] = { $in: sid };
      }

      const sortFilter = { group_name: 1 };


      const resultSet = await collections.server_group
        .find(searchFilter)
        .collation({ locale: "en", strength: 2 })
        .sort(sortFilter)
        .toArray();

      for (const r of resultSet) {
        r.group_name = await decrypt(r.group_name);
        r.createdBy = await decrypt(r.createdBy);
        r.updatedBy = await decrypt(r.updatedBy);
        r.server = await Promise.all(r.server.map(async (server) => await decrypt(server)))
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

const handleServerGroup = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const { group_name, server, username, ipAddress, adGroup } = req.body;
      const ip = ipAddress;
      const falseValue = false;
      const requestBodySchema = Joi.object({
        group_name: Joi.string().required(),
        server: Joi.array().items(Joi.string()).required(),
        username: Joi.string().required(),
        adGroup: Joi.array().items(Joi.string()).required(),
      });

      const validationResult = requestBodySchema.validate({
        username,
        group_name,
        server,
        adGroup
      });

      if (validationResult.error) {
        return res.status(responseCodes.ERROR).json({
          success: false,
          statusCode: responseCodes.ERROR,
          message: validationResult.error.message,
        });
      }
      const serverGroupData = {
        group_name: await encrypt(group_name),
        server: await Promise.all(server.map(async (ser) => await encrypt(ser))),
        approverAdGroup: adGroup,
        isDeleted: await encrypt(falseValue),
      };

      let resultSet;
      if (req.body.groupId) {
        const { groupId } = req.body;

        const existingGroup = await collections.server_group.findOne({
          _id: ObjectId(groupId),
        });

        if (!existingGroup) {
          return res.status(responseCodes.NOT_FOUND).json({
            success: false,
            statusCode: responseCodes.NOT_FOUND,
            message: "Group not found",
          });
        }

        existingGroup.group_name = await decrypt(existingGroup.group_name);
        existingGroup.createdBy = await decrypt(existingGroup.createdBy);
        existingGroup.updatedBy = await decrypt(existingGroup.updatedBy);
        existingGroup.server = await Promise.all(existingGroup.server.map(async (server) => await decrypt(server)))

        serverGroupData.updatedAt = new Date();
        (serverGroupData.updatedBy = await encrypt(username));

        (resultSet = await collections.server_group.updateOne(
          { _id: ObjectId(groupId) },
          { $set: serverGroupData }
        ));

        if (resultSet) {
          const updatedRecord = await collections.server_group.findOne({ _id: ObjectId(groupId) });

          updatedRecord.group_name = await decrypt(updatedRecord.group_name);
          updatedRecord.createdBy = await decrypt(updatedRecord.createdBy);
          updatedRecord.updatedBy = await decrypt(updatedRecord.updatedBy);
          updatedRecord.server = await Promise.all(updatedRecord.server.map(async (server) => await decrypt(server)))

          let changes = {};

          const changedFieldValues = getChangedFields(existingGroup, updatedRecord);

          handleCreateLogFun(collections, {
            ip: ip,
            username: username,
            actionType: "Update Server Exception",
            module: "Server Group",
            prevValue: existingGroup,
            changes: changes,
            fieldChanged: changedFieldValues,
            updatedValue: updatedRecord,
          });
        }
      } else {

        serverGroupData.createdAt = new Date();
        (serverGroupData.createdBy = await encrypt(username));
        const exitUsers = await collections.server_group.find({ group_name: serverGroupData.group_name }).toArray();
        console.log("exit users", exitUsers)
        if (exitUsers.length > 0) {
          for (const item of exitUsers) {
            const deleted = await decrypt(item.isDeleted);
            if (deleted === "false") {
              return res.status(responseCodes.ERROR).json({
                flag: "error",
                error: " Group already exists",
              });
            }
          }
        }
        resultSet = await collections.server_group.insertOne(serverGroupData);
        const updatedRecords = resultSet?.ops[0];

        updatedRecords.group_name = await decrypt(updatedRecords.group_name);
        updatedRecords.isDeleted = await decrypt(updatedRecords.isDeleted) === "true";
        updatedRecords.createdBy = await decrypt(updatedRecords.createdBy);
        updatedRecords.updatedBy = await decrypt(updatedRecords.updatedBy);
        updatedRecords.server = updatedRecords.server ? await Promise.all(updatedRecords.server.map(async (server) => await decrypt(server))) : []

        const changedFieldValues = getChangedFields({}, updatedRecords);

        if (resultSet) {
          handleCreateLogFun(collections, {
            ip: ip,
            username: username,
            actionType: "Create Server Group",
            module: "Server Group",
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
        message: "Server group handled successfully",
        data: resultSet.ops,
      });
    } catch (error) {
      console.error(error);
      return res.status(responseCodes.SERVER_ERROR).json({
        success: false,
        statusCode: responseCodes.SERVER_ERROR,
        message: "An error occurred while handling the server group",
      });
    }
  });

const getServerGroupDetails = async (req, res) =>
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

      const resultSet = await collections.server_group.findOne({
        group_name: groupName,
      });

      resultSet.group_name = await decrypt(resultSet.group_name);
      resultSet.createdBy = await decrypt(resultSet.createdBy)
      resultSet.updatedBy = await decrypt(resultSet.updatedBy)
      resultSet.server = await Promise.all(resultSet.server.map(async (server) => await decrypt(server)))


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
      const resultSet = await collections.server_group.updateOne({ _id: ObjectId(groupId) },
        {
          $set: { isDeleted: await encrypt(trueValue) },
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
const handleExceptionList = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const { server, ipAddress, remarks, startDate, endDate } = req.body;
      const { username } = req.user;
      const serverType = req.body?.serverType?.trim() ?? "";
      const ip = ipAddress;
      const falseValue = false;
      const requestBodySchema = Joi.object({
        server: Joi.array().items(Joi.string()).required(),
        serverType: Joi.string().required(),
        username: Joi.string().required(),
        remarks: Joi.string().required(),
      });

      const newendDate = new Date(req.body.endDate);
      const newstartDate = new Date(req.body.startDate);
      const diffInMilliseconds = Math.abs(newendDate - newstartDate);

      // Convert milliseconds to days
      const diffInDays = Math.floor(diffInMilliseconds / (1000 * 60 * 60 * 24));
      if (diffInDays > 90) {
        return res.status(responseCodes.SUCCESS).json({
          flag: "error",
          error: "Date range cannot be greater than 90days",
        });
      }
      if (diffInDays < 30) {
        return res.status(responseCodes.SUCCESS).json({
          flag: "error",
          error: "Date Range cannot be less than 30 days",
        });
      }
      const validationResult = requestBodySchema.validate({
        username,
        server,
        remarks,
        serverType
      });

      if (validationResult.error) {
        return res.status(responseCodes.ERROR).json({
          success: false,
          statusCode: responseCodes.ERROR,
          message: validationResult.error.message,
        });
      }
      let encryptServer = await Promise.all(server.map(async (ser) => await encrypt(ser)))

      const serverGroupData = {
        server: await Promise.all(server.map(async (ser) => await encrypt(ser))),
        serverType: await encrypt(serverType),
        isDeleted: await encrypt(falseValue),
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        remarks: await encrypt(remarks),
      };

      let resultSet;
      if (req.body.groupId) {
        const { groupId } = req.body;

        const existingGroup = await collections.server_exception_list.findOne({
          _id: ObjectId(groupId),
        });
        if (!existingGroup) {
          return res.status(responseCodes.NOT_FOUND).json({
            success: false,
            statusCode: responseCodes.NOT_FOUND,
            message: "Group not found",
          });
        }

        existingGroup.server = await decrypt(existingGroup.server);
        existingGroup.serverType = await decrypt(existingGroup.serverType);
        existingGroup.username = await decrypt(existingGroup.username);
        existingGroup.createdBy = await decrypt(existingGroup.createdBy);
        existingGroup.updatedBy = await decrypt(existingGroup.updatedBy)
        existingGroup.reason = await decrypt(existingGroup?.reason ?? "");
        existingGroup.remarks = await decrypt(existingGroup?.remarks ?? "");
        existingGroup.isDeleted = await decrypt(existingGroup.isDeleted) === "true";

        const EditserverGroupData = {
          server: encryptServer[0],
          serverType: await encrypt(serverType),
          isDeleted: await encrypt(falseValue),
          remarks: await encrypt(remarks),
          startDate,
          endDate
        };
        EditserverGroupData.updatedAt = new Date();
        (EditserverGroupData.updatedBy = await encrypt(username)),

          (resultSet = await collections.server_exception_list.updateOne(
            { _id: ObjectId(groupId) },
            { $set: EditserverGroupData }
          ));

        if (resultSet) {
          const updatedRecord = await collections.server_exception_list
            .findOne({ _id: ObjectId(groupId) });
          let changes = {};

          updatedRecord.server = await decrypt(updatedRecord.server);
          updatedRecord.serverType = await decrypt(updatedRecord.serverType);
          updatedRecord.username = await decrypt(updatedRecord.username)
          updatedRecord.createdBy = await decrypt(updatedRecord.createdBy);
          updatedRecord.updatedBy = await decrypt(updatedRecord.updatedBy)
          updatedRecord.reason = await decrypt(updatedRecord?.reason ?? "");
          updatedRecord.remarks = await decrypt(updatedRecord?.remarks ?? "");
          updatedRecord.isDeleted = await decrypt(updatedRecord.isDeleted) === "true";

          const changedFieldValues = getChangedFields(existingGroup, updatedRecord);

          handleCreateLogFun(collections, {
            ip: ip,
            username: username,
            actionType: "Update Server Exception",
            module: "Server Group",
            prevValue: existingGroup,
            changes: changes,
            fieldChanged: changedFieldValues,
            updatedValue: updatedRecord,
          });
        }
      } else {

        serverGroupData.createdAt = new Date();
        (serverGroupData.createdBy = await encrypt(username));
        (serverGroupData.updatedBy = await encrypt(username));
        const exitUsers = await collections.server_exception_list.find({ server: { $in: serverGroupData.server } }).toArray();

        if (exitUsers.length > 0) {
          for (const item of exitUsers) {
            const deleted = await decrypt(item.isDeleted);
            if (deleted === "false") {
              return res.status(responseCodes.ERROR).json({
                flag: "error",
                error: " server exception already exists",
              });
            }
          }
        }

        for (const server of serverGroupData.server) {
          let userObj = {}
          userObj["username"] = await encrypt(username)
          userObj["server"] = server
          userObj["serverType"] = await encrypt(serverType);
          userObj["remarks"] = await encrypt(remarks)
          userObj["createdBy"] = await encrypt(username)
          userObj["updatedBy"] = await encrypt(username)
          userObj["createdAt"] = new Date();
          userObj["updatedAt"] = new Date();
          userObj["isDeleted"] = await encrypt(falseValue)
          userObj["startDate"] = new Date(startDate)
          userObj["endDate"] = new Date(endDate)

          resultSet = await collections.server_exception_list.insertOne(userObj);

          const updatedRecords = resultSet.ops[0];
          updatedRecords.server = await decrypt(updatedRecords.server);
          updatedRecords.serverType = await decrypt(updatedRecords?.serverType);
          updatedRecords.username = await decrypt(updatedRecords.username)
          updatedRecords.createdBy = await decrypt(updatedRecords.createdBy);
          updatedRecords.updatedBy = await decrypt(updatedRecords.updatedBy)
          updatedRecords.reason = await decrypt(updatedRecords.reason);
          updatedRecords.remarks = await decrypt(updatedRecords.remarks);
          updatedRecords.isDeleted = await decrypt(updatedRecords.isDeleted)

          const changedFieldValues = getChangedFields({}, updatedRecords);

          if (resultSet) {
            handleCreateLogFun(collections, {
              ip: ip,
              username: username,
              actionType: "Create Server Exception",
              module: "Server Group",
              prevValue: "",
              changes: "Record Added",
              fieldChanged: changedFieldValues,
              updatedValue: updatedRecords,
            });
          }
        }

      }
      return res.status(responseCodes.SUCCESS).json({
        success: true,
        statusCode: responseCodes.SUCCESS,
        message: "Server Exception handled successfully",
        data: resultSet.ops,
      });
    } catch (error) {
      console.error(error);
      return res.status(responseCodes.SERVER_ERROR).json({
        success: false,
        statusCode: responseCodes.SERVER_ERROR,
        message: "An error occurred while handling the server exception",
      });
    }
  });
const getExceptionList = async (req, res) => {
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;

      const limit = parseInt(reqbody.pageSize) || 10;
      const pageNo = parseInt(reqbody.pageNo - 1) || 0;

      const skip = pageNo * limit;
      const { environment, region, platform, fromDate, toDate, servers } = reqbody
      const falseValue = false;
      const searchFilter = {
        isDeleted: await encrypt(falseValue)
      };
      const sortFilter = { updatedAt: -1 };

      const configReqBodyValidation = Joi.object({
        limit: Joi.number().required(),
        pageNo: Joi.number().required(),
        servers: Joi.string(),
        fromDate: Joi.date(),
        toDate: Joi.date(),
      });

      const validationBody = { limit, pageNo, servers, toDate, fromDate };

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

      let FilterSearch = {}
      if (servers) {
        const serversArray = servers.split(",").map((user) => user.trim()).filter((user) => user !== "");
        if (serversArray.length > 0) {
          const encryptedServers = await Promise.all(serversArray?.map(async (user) => await encrypt(user)))
          searchFilter['server'] = { $in: encryptedServers }
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
      if (region) {
        const regionArray = region.split(",").map((r) => r.trim()).filter((r) => r !== "");
        if (regionArray.length > 0) {
          FilterSearch['cmdb.slRegion'] = { $in: regionArray }
        }
      }
      if (environment) {
        const environmentArray = environment.split(",").map((env) => env.trim()).filter((env) => env !== "");
        if (environmentArray.length > 0) {
          FilterSearch['cmdb.ciSapNameEnv'] = { $in: environmentArray }
        }
      }
      if (platform) {
        const platformArray = platform.split(",").map((p) => p.trim()).filter((p) => p !== "");
        if (platformArray.length > 0) {
          FilterSearch['cmdb.slPlatform'] = { $in: platformArray }
        }
      }
      let serverList;
      let filteredServers;
      if (platform || region || environment) {

        serverList = await collections.cybersphere_servers.find({ ...FilterSearch }).toArray()
        filteredServers = serverList.map((list) => list.hostname)

      }
      let resultSet;
      if (filteredServers) {

        if (filteredServers.length > 0) {
          const encryptedServers = await Promise.all(filteredServers?.map(async (user) => await encrypt(user)))
          searchFilter['server'] = { $in: encryptedServers }
        }
      }
      // Pagination logic only if limit is not 0

      if (limit > 0) {
        resultSet = await collections.server_exception_list
          .find(searchFilter)
          .skip(skip)
          .limit(limit)
          .collation({ locale: "en", strength: 2 })
          .sort(sortFilter)
          .toArray();
      } else {
        // If no pagination is applied, return all records
        resultSet = await collections.server_exception_list
          .find(searchFilter)
          .sort(sortFilter)
          .toArray();
      }
     


      for (const r of resultSet) {

        r.server = await decrypt(r.server);
        r.serverType = await decrypt(r.serverType);
        r.createdBy = await decrypt(r.createdBy);
        r.updatedBy = await decrypt(r.updatedBy)
        r.reason = await decrypt(r.reason);
        r.remarks = await decrypt(r.remarks);
        r.isDeleted = await decrypt(r.isDeleted)
        r.username = await decrypt(r.username)

        const cmdbDetails = await collections.cybersphere_servers.findOne({
          hostname: r.server
        }, {
          projection: { cmdb: 1, hostname: 1, _id: 0 },
        })

        r.region = cmdbDetails?.cmdb.slRegion
        r.environment = cmdbDetails?.cmdb.ciSapNameEnv
        r.platform = cmdbDetails?.cmdb.slPlatform
        r.serviceName = cmdbDetails?.cmdb.slName
        r.sid = cmdbDetails?.cmdb.ciSapNameSid

      }
      const totalCount = await collections.server_exception_list.countDocuments(
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
const getCybersphereServers = async (req, res) => {
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;

      const limit = parseInt(reqbody.pageSize) || 10;
      const pageNo = parseInt(reqbody.pageNo - 1) || 0;

      const skip = pageNo * limit;
      const { environment, region, platform, fromDate, toDate, servers } = reqbody
      const searchFilter = {
      };
      const sortFilter = { updatedAt: -1 };

      const configReqBodyValidation = Joi.object({
        limit: Joi.number().required(),
        pageNo: Joi.number().required(),
        servers: Joi.string(),
        fromDate: Joi.date(),
        toDate: Joi.date(),
      });

      const validationBody = { limit, pageNo, servers, toDate, fromDate };

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

      let FilterSearch = {}
      if (servers) {
        const serversArray = servers.split(",").map((user) => user.trim()).filter((user) => user !== "");
        if (serversArray.length > 0) {
          const encryptedServers = await Promise.all(serversArray?.map(async (user) => await encrypt(user)))
          searchFilter['server'] = { $in: encryptedServers }
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
      if (region) {
        const regionArray = region.split(",").map((r) => r.trim()).filter((r) => r !== "");
        if (regionArray.length > 0) {
          FilterSearch['cmdb.slRegion'] = { $in: regionArray }
        }
      }
      if (environment) {
        const environmentArray = environment.split(",").map((env) => env.trim()).filter((env) => env !== "");
        if (environmentArray.length > 0) {
          FilterSearch['cmdb.ciSapNameEnv'] = { $in: environmentArray }
        }
      }
      if (platform) {
        const platformArray = platform.split(",").map((p) => p.trim()).filter((p) => p !== "");
        if (platformArray.length > 0) {
          FilterSearch['cmdb.slPlatform'] = { $in: platformArray }
        }
      }
      let serverList;
      let filteredServers;
      if (platform || region || environment) {

        serverList = await collections.cybersphere_servers.find({ ...FilterSearch }).toArray()
        filteredServers = serverList.map((list) => list.hostname)

      }
      let resultSet;
      if (filteredServers) {

        if (filteredServers.length > 0) {
          const encryptedServers = await Promise.all(filteredServers?.map(async (user) => await encrypt(user)))
          searchFilter['server'] = { $in: encryptedServers }
        }
      }
      // Pagination logic only if limit is not 0

      if (limit > 0) {
        resultSet = await collections.cybersphere_servers
          .find(searchFilter)
          .skip(skip)
          .limit(limit)
          .collation({ locale: "en", strength: 2 })
          .sort(sortFilter)
          .toArray();
      } else {
        // If no pagination is applied, return all records
        resultSet = await collections.cybersphere_servers
          .find(searchFilter)
          .sort(sortFilter)
          .toArray();
      }
      const totalCount = await collections.server_exception_list.countDocuments(
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
const deleteException = async (req, res) =>
  connectDatabase(async (collections) => {
    try {

      const reqbody = req.method === "GET" ? req.query : req.body;
      const { server, username, ipAddress, id } = reqbody;
      console.log("server", server, username)
      const ip = ipAddress;
      const reqBodyValidation = Joi.object({
        server: Joi.string().required(),
        username: Joi.string().required(),
        ipAddress: Joi.string().required(),
      });

      const validationBody = { server, username, ipAddress };

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
      const resultSet = await collections.server_exception_list.updateOne(
        { _id: ObjectId(id) },
        {
          $set: { isDeleted: await encrypt(trueValue) },
        }
      );

      if (resultSet) {
        handleCreateLogFun(collections, {
          ip: ip,
          username: username,
          actionType: "Delete Server Exception",
          module: "Server Group",
          prevValue: server,
          changes: "Record Deleted",
          updatedValue: `${server} server group deleted`,
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
module.exports = {
  connectDatabase,
  getServerGroup: (req, res) => getServerGroup(req, res),
  handleServerGroup: (req, res) => handleServerGroup(req, res),
  getServerGroupList: (req, res) => getServerGroupList(req, res),
  getServerGroupDetails: (req, res) => getServerGroupDetails(req, res),
  deleteServerGroup: (req, res) => deleteServerGroup(req, res),
  getExceptionList: (req, res) => getExceptionList(req, res),
  handleExceptionList: (req, res) => handleExceptionList(req, res),
  deleteException: (req, res) => deleteException(req, res),
  getCybersphereServers: (req, res) => getCybersphereServers(req, res),
};
