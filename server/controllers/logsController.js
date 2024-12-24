/* eslint-disable no-unused-vars */
/* eslint-disable no-const-assign */
const responseCodes = require("../utils/responseCodes");
const Joi = require("joi");
const APIMessages = require("../utils/messages");
require("dotenv").config();

const db = require("../database/connection");
const { decrypt, encrypt } = require("../utils/encryptFunctions");

const connectDatabase = async (callback) => {
  try {
    const collections = await db.connectToDatabase();
    return await callback(collections);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error occurred: ${error}`);
  }
};

const getAuditLogs = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;
      const limit = parseInt(reqbody.pageSize) || 10;
      const pageNo = parseInt(reqbody.pageNo - 1) || 0;
      const {username,actionTypes,startDate,endDate,module}=reqbody
      const skip = pageNo * limit;
      const  searchUser  = username;
      const searchFilter = {};
      
      if(actionTypes?.length>0){
        const actions = actionTypes.split(',').map(a => a.trim()).filter((a) => a !== "");
        const encryptedActions = await Promise.all(actions?.map(async (action) => await encrypt(action)))
        searchFilter["actionType"] = { $in: encryptedActions };
      }
      if(module?.length>0){
        const modules = module.split(',').map(a => a.trim()).filter((a) => a !== "");
        const encryptedModules = await Promise.all(modules?.map(async (m) => await encrypt(m)))
        searchFilter["module"] = { $in: encryptedModules };
      }
      if(username?.length>0){
        const usernameArray = username.split(",").map((user) => user.trim()).filter((user) => user !== "");
        const encryptedUsernames = await Promise.all(usernameArray?.map(async (user) => await encrypt(user)))
        searchFilter['username'] = { $in: encryptedUsernames }
        
      }
      if (startDate || endDate) {
        searchFilter["date"] = {};
        
        if (startDate) {
          searchFilter["date"]["$gte"] = new Date(startDate);
        }
        if (endDate) {
        
          const endDateTime = new Date(endDate);
          endDateTime.setDate(endDateTime.getDate() + 1);
          searchFilter["date"]["$lte"] = endDateTime;
        }
      }
      
      const sortFilter = { date: -1 };
      const configReqBodyValidation = Joi.object({
        limit: Joi.number().required(),
        pageNo: Joi.number().required(),
        searchUser: Joi.string(),
      });

      const validationBody = { limit, pageNo };

      if (searchUser) {
        validationBody["searchUser"] = username;
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
     
      const resultSet = await collections.audit_logs
        .find(searchFilter)
        .skip(skip)
        .limit(limit)
        .sort(sortFilter)
        .toArray();

      for (const ad of resultSet) {
        ad.username = await decrypt(ad.username);
        ad.module = await decrypt(ad.module)
        ad.actionType = await decrypt(ad.actionType)
        ad.ip = await decrypt(ad.ip)
        ad.hostname = await decrypt(ad.hostname)
      }

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

module.exports = {
  connectDatabase,
  handleCreateLog: (req, res) => handleCreateLog(req, res),
  getAuditLogs: (req, res) => getAuditLogs(req, res),
};
