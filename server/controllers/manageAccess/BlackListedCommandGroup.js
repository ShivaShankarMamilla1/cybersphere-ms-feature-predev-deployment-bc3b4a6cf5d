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

const getBlacklistedCommands = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const resultSet = await collections.blacklistedCommands.findOne();
      resultSet.username = await decrypt(resultSet.username);
      resultSet.commands = await Promise.all(resultSet.commands.map(async (cmd) => await decrypt(cmd)))

      resultSet.commands = resultSet?.commands?.join(", ");
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


const handleBlacklistedCommands = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;
      const { id, commands, username, ipAddress } = reqbody;
      const ip = ipAddress;

      const userRequestBody = Joi.object({
        commands: Joi.string().allow("").optional(),
        _id: Joi.string().custom(objectIdValidator, "Object Id validation"),
        username: Joi.string().required(),
      });

      const commandObj = { commands, username };
      const validationResult = userRequestBody.validate(commandObj);

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
      commandObj["commands"] = await Promise.all((commandObj.commands ? commandObj.commands.split(",") : []).map(async (ser) => await encrypt(ser)));

      commandObj["updatedBy"] = await encrypt(username);
      if (id) {
        const existingRecord = await collections.blacklistedCommands
          .findOne({ _id: ObjectId(id) })

        existingRecord.commands = await Promise.all(existingRecord.commands.map(async (cmd) => await decrypt(cmd)));
        existingRecord.updatedBy = await decrypt(existingRecord.updatedBy)

        if (existingRecord.length === 0) {
          return res.status(responseCodes.SUCCESS).json({
            success: false,
            statusCode: responseCodes.ERROR,
            message: "No record with Id",
          });
        }

        commandObj["updatedAt"] = new Date();
        resultSet = await collections.blacklistedCommands.updateOne(
          { _id: ObjectId(id) },
          { $set: commandObj },
          { returnDocument: "after" }
        );

        if (resultSet) {
          const updatedRecord = await collections.blacklistedCommands
            .findOne({ _id: ObjectId(id) });

          updatedRecord.commands = await Promise.all(updatedRecord.commands.map(async (cmd) => await decrypt(cmd)));
          updatedRecord.updatedBy = await decrypt(updatedRecord.updatedBy)

          let changes = {};

          const changedFieldValues = getChangedFields(existingRecord, updatedRecord);

          handleCreateLogFun(collections, {
            ip: ip,
            username: username,
            actionType: "Updated Blacklisted Command",
            module: "Blacklisted Group",
            prevValue: existingRecord,
            changes: changes,
            fieldChanged: changedFieldValues,
            updatedValue: updatedRecord,
          });
        }
      } else {
        commandObj["createdAt"] = new Date();
        resultSet = await collections.blacklistedCommands.insertOne(commandObj);

        const changedFieldValues = getChangedFields({}, resultSet.ops);

        if (resultSet) {
          handleCreateLogFun(collections, {
            ip: ip,
            username: username,
            actionType: "Created Blacklisted Command",
            module: "Blacklisted Group",
            prevValue: "",
            changes: "Record Added",
            fieldChanged: changedFieldValues,
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

module.exports = {
  connectDatabase,
  getBlacklistedCommands: (req, res) => getBlacklistedCommands(req, res),
  handleBlacklistedCommands: (req, res) => handleBlacklistedCommands(req, res),
};
