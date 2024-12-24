/* eslint-disable no-unused-vars */
const Joi = require("joi");
const { ObjectId } = require("mongodb");
const db = require("../database/connection");
const responseCodes = require("../utils/responseCodes");
const APIMessages = require("../utils/messages");
const { encrypt, decrypt } = require("../utils/encryptFunctions");

const connectDatabase = async (callback) => {
  try {
    const collections = await db.connectToDatabase();
    return await callback(collections);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error occurred: ${error}`);
  }
};

const getApprovalConfig = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      // Fetch the configuration from the database
      const config = await collections.approval_control_config.findOne({});

      if (!config) {
        return res.status(responseCodes.SUCCESS).json({
          flag: "success",
          data: {},
        });
      }

      if (config?.manageAccess) {
        config.manageAccess.approvalNeeded = config.manageAccess.approvalNeeded
          ? (await decrypt(config.manageAccess.approvalNeeded)) === "true"
          : false;
        config.manageAccess.multiLevel = config.manageAccess.multiLevel
          ? (await decrypt(config.manageAccess.multiLevel)) === "true"
          : false;
        if (
          config?.manageAccess.approvers &&
          config?.manageAccess.approvers?.length
        ) {
          config.manageAccess.approvers = await Promise.all(
            config?.manageAccess.approvers.map(
              async (cmd) => await decrypt(cmd)
            )
          );
        }
      }
      if (config?.serverException) {
        config.serverException.approvalNeeded = config.serverException
          .approvalNeeded
          ? (await decrypt(config.serverException.approvalNeeded)) === "true"
          : false;
        config.serverException.multiLevel = config.serverException.multiLevel
          ? (await decrypt(config.serverException.multiLevel)) === "true"
          : false;
        if (
          config?.serverException.approvers &&
          config?.serverException.approvers?.length
        ) {
          config.serverException.approvers = await Promise.all(
            config?.serverException.approvers.map(
              async (cmd) => await decrypt(cmd)
            )
          );
        }
      }
      if (config?.cliSettings) {
        config.cliSettings.approvalNeeded = config.cliSettings.approvalNeeded
          ? (await decrypt(config.cliSettings.approvalNeeded)) === "true"
          : false;
        config.cliSettings.multiLevel = config.cliSettings.multiLevel
          ? (await decrypt(config.cliSettings.multiLevel)) === "true"
          : false;
        if (
          config?.cliSettings.approvers &&
          config?.cliSettings.approvers?.length
        ) {
          config.cliSettings.approvers = await Promise.all(
            config?.cliSettings.approvers.map(async (cmd) => await decrypt(cmd))
          );
        }
      }

      // Return the configuration details, including the encoded logo
      res.status(responseCodes.SUCCESS).json({
        flag: "success",
        data: config,
      });
    } catch (error) {
      res.status(responseCodes.SERVER_ERROR).json({
        flag: "error",
        error: error.message,
        message: APIMessages.SERVER_ERROR,
      });
    }
  });

const getIamUsersApproverConfig = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      // Fetch the configuration from the database
      const adminAray = ["snaray69", "skuma753", "raugus10", "rkuma374", "vkuma214"]
      const adminRegexArray = adminAray.map((username) => ({
        jnjMSUsername: { $regex: `^${username}$`, $options: "i" },
      }));

      // Query to find documents matching any username in the array
      const config = await collections.iamusers.findOne({
        $or: adminRegexArray,
      });


      if (!config) {
        return res.status(responseCodes.SUCCESS).json({
          flag: "success",
          data: config,
        });
      }


      // Return the configuration details, including the encoded logo
      res.status(responseCodes.SUCCESS).json({
        flag: "success",
        data: config,
      });
    } catch (error) {
      res.status(responseCodes.SERVER_ERROR).json({
        flag: "error",
        error: error.message,
        message: APIMessages.SERVER_ERROR,
      });
    }
  });


const handleApprovalConfig = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;
      const { manageAccess, serverException, cliSettings } = reqbody;

      // Define the schema for validation
      const configRequestBody = Joi.object({
        manageAccess: Joi.object(),
        serverException: Joi.object(),
        cliSettings: Joi.object(),
      });

      // Create the config object
      const configObj = {};

      if (manageAccess) {
        configObj.manageAccess = manageAccess;
        configObj.manageAccess.approvalNeeded = await encrypt(
          configObj.manageAccess.approvalNeeded
        );
        configObj.manageAccess.multiLevel = await encrypt(
          configObj.manageAccess.multiLevel
        );
        if (
          configObj?.manageAccess?.approvers &&
          configObj?.manageAccess?.approvers.length
        )
          configObj.manageAccess.approvers = await Promise.all(
            configObj.manageAccess.approvers.map(
              async (approver) => await encrypt(approver)
            )
          );
      }
      if (serverException) {
        configObj.serverException = serverException;
        configObj.serverException.approvalNeeded = await encrypt(
          configObj.serverException.approvalNeeded
        );
        configObj.serverException.multiLevel = await encrypt(
          configObj.serverException.multiLevel
        );
        if (
          configObj?.serverException?.approvers &&
          configObj?.serverException?.approvers.length
        )
          configObj.serverException.approvers = await Promise.all(
            configObj.serverException.approvers.map(
              async (approver) => await encrypt(approver)
            )
          );
      }
      if (cliSettings) {
        configObj.cliSettings = cliSettings;
        configObj.cliSettings.approvalNeeded = await encrypt(
          configObj.cliSettings.approvalNeeded
        );
        configObj.cliSettings.multiLevel = await encrypt(
          configObj.cliSettings.multiLevel
        );
        if (
          configObj?.cliSettings?.approvers &&
          configObj?.cliSettings?.approvers.length
        )
          configObj.cliSettings.approvers = await Promise.all(
            configObj.cliSettings.approvers.map(
              async (approver) => await encrypt(approver)
            )
          );
      }

      // Validate the config object
      const validationResult = configRequestBody.validate(configObj);
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

      // Prepare the config document to be inserted or updated

      const configDocument = {
        ...configObj,
      };

      await collections.approval_control_config.updateOne(
        {},
        { $set: configDocument },
        { upsert: true }
      );

      res.status(responseCodes.SUCCESS).json({
        flag: "success",
        message: APIMessages.SUCCESS,
        data: [],
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
  getApprovalConfig: (req, res) => getApprovalConfig(req, res),
  getIamUsersApproverConfig: (req, res) => getIamUsersApproverConfig(req, res),
  handleApprovalConfig: (req, res) => handleApprovalConfig(req, res),
};