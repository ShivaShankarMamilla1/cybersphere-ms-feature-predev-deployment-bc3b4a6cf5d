/* eslint-disable no-unused-vars */
/* eslint-disable no-const-assign */
const responseCodes = require("../utils/responseCodes");
const Joi = require("joi");
const APIMessages = require("../utils/messages");
require("dotenv").config();
const { encrypt, decrypt } = require("../utils/encryptFunctions");
const { ObjectId } = require("mongodb");

const db = require("../database/connection");
const { handleCreateLogFun } = require("./agentController");
const { getChangedFields } = require("../utils/commonFunctions");


const connectDatabase = async (callback) => {
  try {
    const collections = await db.connectToDatabase();
    return await callback(collections);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error occurred: ${error}`);
  }
};

const handleUpdateConfig = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;
      const logoFile = req.file; // Get the uploaded logo file
      const {
        appName,
        subHeading,
        auditLogSelect,
        company,
      } = reqbody;


      // Define the schema for validation
      const configRequestBody = Joi.object({
        appName: Joi.string(),
        subHeading: Joi.string(),
        auditLogSelect: Joi.string(),
        company: Joi.string(),
      });

      // Create the config object
      const configObj = {};

      if (appName) {
        configObj.appName = appName
      }
      if (subHeading) {
        configObj.subHeading = subHeading
      }
      if (auditLogSelect) {
        configObj.auditLogSelect = auditLogSelect
      }
      if (company) {
        configObj.company = company
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
      let logo = null;
      if (logoFile) {
        if (logoFile.mimetype === "image/svg+xml") {
          // For SVG, store as a UTF-8 string (since SVG is XML-based text)
          logo = logoFile.buffer.toString("utf-8");
        } else {
          // For other image types, store as a buffer
          logo = logoFile.buffer;
        }
      }

      configObj.appName = await encrypt(configObj.appName)
      configObj.subHeading = await encrypt(configObj.subHeading)
      configObj.auditLogSelect = await encrypt(configObj.auditLogSelect)
      configObj.company = await encrypt(configObj.company)

      const configDocument = {
        ...configObj,
      };
      if (logo) {
        configDocument.logo = logo;
      }

      await collections.config_settings.updateOne(
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

const handleEmailConfig = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;
      const {
        smtpHost,
        port,
        password,
        useTls,
        from,
      } = reqbody;

      const configRequestBody = Joi.object({
        password: Joi.string().required(),
        smtpHost: Joi.string().optional().allow(""),
        port: Joi.number().optional().allow(""),
        useTls: Joi.boolean().optional().allow(""),
        from: Joi.string().required(),
      });

      let configObj = {
        smtpHost,
        port,
        password,
        useTls,
        from
      };

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

      configObj = {
        smtpHost: await encrypt(smtpHost),
        port: await encrypt(port),
        password: await encrypt(password),
        useTls: await encrypt(useTls),
        from: await encrypt(from),
      };

      const settingObj = {
        emailConfig: configObj
      };


      await collections.config_settings.updateOne(
        {},
        { $set: settingObj },
        { upsert: true }
      );

      res.status(responseCodes.SUCCESS).json({
        flag: "success",
        message: APIMessages.SUCCESS,
      });


    } catch (error) {
      res.status(responseCodes.SERVER_ERROR).json({
        flag: "error",
        error: error.message,
        message: APIMessages.SERVER_ERROR,
      });
    }

  });

const handleEmailTemplate = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;
      const {
        to,
        cc,
        bcc,
        notificationType,
        subject,
        body,
        approvalSubject,
        approvalBody,
        enableNotification,
        enableApprovalNotification,
        templateId
      } = reqbody;

      const templateValidate = Joi.object({
        to: Joi.string().required(),
        notificationType: Joi.array().required(),
        cc: Joi.string().optional().allow(""),
        bcc: Joi.string().optional().allow(""),
        subject: Joi.string().required(),
        body: Joi.string().required(),
      });

      let emailObj = {
        to,
        cc,
        bcc,
        notificationType,
        subject,
        body,
      };

      const validationResult = templateValidate.validate(emailObj);
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

      emailObj = {
        to: await encrypt(to),
        cc: await encrypt(cc),
        bcc: await encrypt(bcc),
        notificationType: await Promise.all(notificationType.map(async (noti) => await encrypt(noti))),
        subject: await encrypt(subject),
        body: await encrypt(body),
        approvalSubject: await encrypt(approvalSubject),
        approvalBody: await encrypt(approvalBody),
        enableNotification: await encrypt(enableNotification),
        enableApprovalNotification: await encrypt(enableApprovalNotification),
      };

      if (templateId) {
        const existingRecord = await collections.email_templates.findOne({
          _id: ObjectId(templateId),
        });
        if (!existingRecord) {
          return res.status(responseCodes.NOT_FOUND).json({
            success: false,
            statusCode: responseCodes.NOT_FOUND,
            message: "Template not found",
          });
        }
        emailObj.updatedAt = new Date();
        await collections.email_templates.updateOne(
          { _id: ObjectId(templateId) },
          { $set: emailObj }
        );

      } else {
        emailObj.createdAt = new Date();
        await collections.email_templates.insertOne(emailObj);
      }

      res.status(responseCodes.SUCCESS).json({
        flag: "success",
        message: APIMessages.SUCCESS,
      });

    } catch (error) {
      res.status(responseCodes.SERVER_ERROR).json({
        flag: "error",
        error: error.message,
        message: APIMessages.SERVER_ERROR,
      });
    }
  });

const getConfig = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      // Fetch the configuration from the database
      // retrieve only required fields
      const config = await collections.config_settings.findOne({},
        {
          projection: {
            _id: 1,
            logo: 1,
            emailConfig: 1,
            template: 1,
            appName: 1,
            subHeading: 1,
            auditLogSelect: 1,
            company: 1,
            access_config_provider_url: 1,
            access_config_provider_username: 1,
            opensearch_url: 1,
            opensearch_index: 1,
            opensearch_username: 1,
            log_message_encryption: 1,
            isCLIEnabled: 1,
          },
        }
      );
      const template = await collections.email_templates.findOne({});
      if (!config) {
        return res.status(responseCodes.SUCCESS).json({
          flag: "success",
          data: {},
        });
      }

      // If the logo exists, handle different image types
      if (config?.logo) {
        if (config?.logo?.toString().startsWith("<svg")) {
          // If it's an SVG, use it directly (since SVG is text-based XML)
          config.logo = `data:image/svg+xml;base64,${Buffer.from(
            config.logo
          ).toString("base64")}`;
        } else {
          // If it's a different image format, convert the buffer to Base64
          config.logo = `data:image/jpeg;base64,${config.logo.toString(
            "base64"
          )}`;
        }
      }

      if (config?.emailConfig) {
        config.emailConfig.from = config?.emailConfig?.from
          ? await decrypt(config?.emailConfig.from)
          : "";
        config.emailConfig.username = config?.emailConfig?.username
          ? await decrypt(config?.emailConfig.username)
          : "";
        config.emailConfig.password = config?.emailConfig?.password
          ? await decrypt(config?.emailConfig.password)
          : "";

        config.emailConfig.smtpHost = config?.emailConfig?.smtpHost
          ? await decrypt(config?.emailConfig.smtpHost)
          : "";
        config.emailConfig.port = config?.emailConfig?.port
          ? await decrypt(config?.emailConfig.port)
          : "";
        config.emailConfig.useTls = config?.emailConfig?.useTls
          ? await decrypt(config?.emailConfig.useTls)
          : "";

      }
      if (template) {
        template.from = template?.from
          ? await decrypt(template?.from)
          : "";
        template.to = template?.to
          ? await decrypt(template?.to)
          : "";
        template.cc = template?.cc
          ? await decrypt(template?.cc)
          : "";
        template.bcc = template?.bcc
          ? await decrypt(template?.bcc)
          : "";

        template.subject = template?.subject
          ? await decrypt(template?.subject)
          : "";
        template.body = template?.body
          ? await decrypt(template?.body)
          : "";
        template.approvalSubject = template?.approvalSubject
          ? await decrypt(template?.approvalSubject)
          : "";

        template.approvalBody = template?.approvalBody
          ? await decrypt(template?.approvalBody)
          : "";
        template.enableNotification = template?.enableNotification
          ? await decrypt(template?.enableNotification)
          : "";
        template.enableApprovalNotification = template?.enableApprovalNotification
          ? await decrypt(template?.enableApprovalNotification)
          : "";
        template.notificationType = await Promise.all(template?.notificationType.map(async (noti) => await decrypt(noti)));

      }
      config["template"] = template;

      config.appName = await decrypt(config.appName)
      config.subHeading = await decrypt(config.subHeading)
      config.auditLogSelect = await decrypt(config.auditLogSelect)
      config.company = await decrypt(config.company)

      config.access_config_provider_url = config?.access_config_provider_url ? await decrypt(config?.access_config_provider_url) : "";
      config.access_config_provider_username = config?.access_config_provider_username ? await decrypt(config?.access_config_provider_username) : "";

      config.opensearch_url = config?.opensearch_url ? await decrypt(config?.opensearch_url) : "";
      config.opensearch_index = config?.opensearch_index ? await decrypt(config?.opensearch_index) : "";
      config.opensearch_username = config?.opensearch_username ? await decrypt(config?.opensearch_username) : "";
      config.log_message_encryption = config?.log_message_encryption ? await decrypt(config?.log_message_encryption) === "true" : false;
      config.isCLIEnabled = config?.isCLIEnabled ? await decrypt(config?.isCLIEnabled) === "true" : false;

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

const saveCLIConfig = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;
      const {
        accessUrl,
        accessUsername,
        accessPassword,
        opensearchUrl,
        opensearchIndex,
        opensearchUsername,
        opensearchPassword,
        isEncryptLogs,
        encyptionKey,
        isCLIEnabled,
        error_index,
        application_index,
        opensearch_command_record_index,
        enforce_etc_profile_script,
        cybersphere_bin_hash,
        cybersphere_profile_script_hash
        
      } = reqbody;

      let { username } = reqbody;

      const projectionFields = {
        _id: 1,
        access_config_provider_url: 1,
        access_config_provider_username: 1,
        opensearch_url: 1,
        opensearch_index: 1,
        opensearch_username: 1,
        log_message_encryption: 1,
        isCLIEnabled: 1,
        updatedBy: 1,
        error_index: 1,
        application_index: 1,
        opensearch_command_record_index: 1,
        enforce_etc_profile_script: 1,
        cybersphere_bin_hash: 1,
        cybersphere_profile_script_hash: 1,
      };

      const configRequestBody = Joi.object({
        accessUrl: Joi.string().uri().required(),
        accessUsername: Joi.string().required(),
        accessPassword: Joi.string().allow("").optional(),
        opensearchUrl: Joi.string().uri().required(),
        opensearchIndex: Joi.string().required(),
        opensearchUsername: Joi.string().required(),
        opensearchPassword: Joi.string().allow("").optional(),
        encyptionKey: Joi.string().allow("").optional(),
        isEncryptLogs: Joi.boolean().required(),
        isCLIEnabled: Joi.boolean().required(),
        username: Joi.string().required(),
        error_index: Joi.string().allow("").optional(),
        application_index: Joi.string().allow("").optional(),
        opensearch_command_record_index: Joi.string().allow("").optional(),
        enforce_etc_profile_script: Joi.boolean().optional(),
        cybersphere_bin_hash: Joi.string().allow("").optional(),
        cybersphere_profile_script_hash: Joi.string().allow("").optional(),
      });

      const configObj = {
        accessUrl,
        accessUsername,
        accessPassword,
        opensearchUrl,
        opensearchIndex,
        opensearchUsername,
        opensearchPassword,
        isEncryptLogs,
        encyptionKey,
        isCLIEnabled,
        username,
        error_index,
        application_index,
        opensearch_command_record_index,
        enforce_etc_profile_script,
        cybersphere_bin_hash,
        cybersphere_profile_script_hash,
      };

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

      username = username.toLowerCase()

      const cliObj = {
        access_config_provider_url: await encrypt(configObj.accessUrl),
        access_config_provider_username: await encrypt(configObj.accessUsername),
        opensearch_url: await encrypt(configObj.opensearchUrl),
        opensearch_index: await encrypt(configObj.opensearchIndex),
        opensearch_username: await encrypt(configObj.opensearchUsername),
        log_message_encryption: await encrypt(configObj.isEncryptLogs),
        isCLIEnabled: await encrypt(configObj.isCLIEnabled),
        updatedBy: await encrypt(username),
      }
      const keysToEncrypt = [
        "accessPassword",
        "opensearchPassword",
        "encyptionKey",
        "error_index",
        "application_index",
        "opensearch_command_record_index",
        "enforce_etc_profile_script",
        "cybersphere_bin_hash",
        "cybersphere_profile_script_hash"
      ];
      
      for (const key of keysToEncrypt) {
        if (configObj[key] && configObj[key] !== "") {
          cliObj[key.replace(/([A-Z])/g, '_$1').toLowerCase()] = await encrypt(configObj[key]);
        }
      }
    
      const previousRecord = await collections.config_settings.findOne({}, { projection: projectionFields });

      previousRecord.access_config_provider_url = previousRecord?.access_config_provider_url ? await decrypt(previousRecord?.access_config_provider_url) : "";
      previousRecord.access_config_provider_username = previousRecord?.access_config_provider_username ? await decrypt(previousRecord?.access_config_provider_username) : "";
      previousRecord.opensearch_url = previousRecord?.opensearch_url ? await decrypt(previousRecord?.opensearch_url) : "";
      previousRecord.opensearch_index = previousRecord?.opensearch_index ? await decrypt(previousRecord?.opensearch_index) : "";
      previousRecord.opensearch_username = previousRecord?.opensearch_username ? await decrypt(previousRecord?.opensearch_username) : "";
      previousRecord.log_message_encryption = previousRecord?.log_message_encryption ? await decrypt(previousRecord?.log_message_encryption) === "true" : false;
      previousRecord.isCLIEnabled = previousRecord?.isCLIEnabled ? await decrypt(previousRecord?.isCLIEnabled) === "true" : false;
      previousRecord.updatedBy = previousRecord?.updatedBy ? await decrypt(previousRecord?.updatedBy) : "";
      previousRecord.error_index = previousRecord?.error_index ? await decrypt(previousRecord?.error_index) : "";
      previousRecord.application_index = previousRecord?.application_index ? await decrypt(previousRecord?.application_index) : "";
      previousRecord.opensearch_command_record_index = previousRecord?.opensearch_command_record_index ? await decrypt(previousRecord?.opensearch_command_record_index) : "";
      previousRecord.enforce_etc_profile_script = previousRecord?.enforce_etc_profile_script ? await decrypt(previousRecord?.enforce_etc_profile_script) === "true" : false;
      previousRecord.cybersphere_bin_hash = previousRecord?.cybersphere_bin_hash ? await decrypt(previousRecord?.cybersphere_bin_hash) : "";
      previousRecord.cybersphere_profile_script_hash = previousRecord?.cybersphere_profile_script_hash ? await decrypt(previousRecord?.cybersphere_profile_script_hash) : "";

      const updateResult = await collections.config_settings.findOneAndUpdate(
        {},
        { $set: cliObj },
        {
          upsert: true,
          returnDocument: "after",
          projection: projectionFields
        }
      );

      const updatedRecord = updateResult?.value ?? {};
      updatedRecord.access_config_provider_url = updatedRecord?.access_config_provider_url ? await decrypt(updatedRecord?.access_config_provider_url) : "";
      updatedRecord.access_config_provider_username = updatedRecord?.access_config_provider_username ? await decrypt(updatedRecord?.access_config_provider_username) : "";
      updatedRecord.opensearch_url = updatedRecord?.opensearch_url ? await decrypt(updatedRecord?.opensearch_url) : "";
      updatedRecord.opensearch_index = updatedRecord?.opensearch_index ? await decrypt(updatedRecord?.opensearch_index) : "";
      updatedRecord.opensearch_username = updatedRecord?.opensearch_username ? await decrypt(updatedRecord?.opensearch_username) : "";
      updatedRecord.log_message_encryption = updatedRecord?.log_message_encryption ? await decrypt(updatedRecord?.log_message_encryption) === "true" : false;
      updatedRecord.isCLIEnabled = updatedRecord?.isCLIEnabled ? await decrypt(updatedRecord?.isCLIEnabled) === "true" : false;
      updatedRecord.updatedBy = updatedRecord?.updatedBy ? await decrypt(updatedRecord?.updatedBy) : "";
      updatedRecord.error_index = updatedRecord?.error_index ? await decrypt(updatedRecord?.error_index) : "";
      updatedRecord.application_index = updatedRecord?.application_index ? await decrypt(updatedRecord?.application_index) : "";
      updatedRecord.opensearch_command_record_index = updatedRecord?.opensearch_command_record_index ? await decrypt(updatedRecord?.opensearch_command_record_index) : "";
      updatedRecord.enforce_etc_profile_script = updatedRecord?.enforce_etc_profile_script ? await decrypt(updatedRecord?.enforce_etc_profile_script) === "true" : false;
      updatedRecord.cybersphere_bin_hash = updatedRecord?.cybersphere_bin_hash ? await decrypt(updatedRecord?.cybersphere_bin_hash) : "";
      updatedRecord.cybersphere_profile_script_hash = updatedRecord?.cybersphere_profile_script_hash ? await decrypt(updatedRecord?.cybersphere_profile_script_hash) : "";

      const changedFieldValues = getChangedFields(previousRecord, updatedRecord);

      handleCreateLogFun(collections, {
        ip: "",
        username: username,
        actionType: "CLI Settings",
        module: "Settings",
        prevValue: previousRecord ?? {},
        changes: "Record Updated",
        fieldChanged: changedFieldValues,
        updatedValue: updatedRecord ?? {},
      });


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
  })
    const getApproverFlows = async (req, res) =>
      connectDatabase(async (collections) => {
        try {
          const { module, id, pageSize, pageNo } = req.method === "GET" ? req.query : req.body;
    
          const limit = parseInt(pageSize) || 10; // Default to 10 items per page
          const currentPage = parseInt(pageNo) || 1; // Default to the first page
          const skip = (currentPage - 1) * limit;
          const query = {
            isDeleted:await encrypt(false)
          };
          const sortFilter = { updatedAt: -1 };
    
          if (id) query._id = ObjectId(id);
          if (module) query.module = await encrypt(module);
    
          if (currentPage < 1) {
            return res.status(responseCodes.BAD_REQUEST).json({
              success: false,
              statusCode: responseCodes.BAD_REQUEST,
              message: "Page number should be greater than 0.",
            });
          }
    
          // Fetch data with pagination
          const resultSetPromise = collections.approval_control_config
            .find(query)
            .sort(sortFilter)
            .skip(skip)
            .limit(limit > 0 ? limit : 0)
            .toArray();
    
          const totalCountPromise = collections.approval_control_config.countDocuments(query);
    
          const [resultSet, totalCount] = await Promise.all([resultSetPromise, totalCountPromise]);
    
          // Decrypt necessary fields
          const decryptApprovers = async (approvers) =>
            Promise.all(approvers.map(async (approver) => await decrypt(approver)));
    
          const decryptedResultSet = await Promise.all(
            resultSet.map(async (item) => ({
              ...item,
              module: await decrypt(item.module),
              l1approvers: await decryptApprovers(item.l1approvers),
              l2approvers: item.l2approvers ? await decryptApprovers(item.l2approvers) : [],
              l3approvers: item.l3approvers ? await decryptApprovers(item.l3approvers) : [],
              createdAt: item.createdAt,
              updatedAt: item.updatedAt,
            }))
          );
    
          // Calculate pagination details
          const totalPage = limit > 0 ? Math.ceil(totalCount / limit) : 1;
    
          const pagination = {
            limit: limit || totalCount,
            currentPage,
            rowCount: decryptedResultSet.length || 0,
            totalPage: totalPage || 1,
            totalCount,
          };
    
          // Respond with success
          res.status(responseCodes.SUCCESS).json({
            success: true,
            statusCode: responseCodes.SUCCESS,
            message: APIMessages.SUCCESS,
            pagination,
            data: decryptedResultSet,
          });
        } catch (e) {
          console.error(e);
          res.status(responseCodes.SERVER_ERROR).json({
            success: false,
            statusCode: responseCodes.SERVER_ERROR,
            message: APIMessages.SERVER_ERROR,
            error: e.message,
          });
        }
      });
    
    const handleApproverFlow = async (req, res) =>
      connectDatabase(async (collections) => {
        try {
          const reqbody = req.method === "GET" ? req.query : req.body;
          const { module, l1approvers, l2approvers, l3approvers, id } = reqbody;
    
          const userRequestBody = Joi.object({
            module: Joi.string().required(),
            l1approvers: Joi.array().required(),
            l2approvers: Joi.array().optional(),
            l3approvers: Joi.array().optional(),
            id: Joi.string().optional(),
          });
    
          const reqBodyValidateObj = { module, l1approvers, l2approvers, l3approvers, id };
    
          const validationResult = userRequestBody.validate(reqBodyValidateObj);
    
          if (validationResult.error) {
            return res.status(responseCodes.BAD_REQUEST).json({
              success: false,
              statusCode: responseCodes.BAD_REQUEST,
              message: validationResult.error?.message.replace(
                /"([^"]+)"/,
                (match, p1) => {
                  return p1
                    .replace(/([a-z])([A-Z])/g, "$1 $2")
                    .replace(/^\w/, (c) => c.toUpperCase());
                }
              ),
            });
          }
    
          const collection = collections.approval_control_config;
    
          // Encrypt approvers' data
          const encryptApprovers = async (approvers) =>
            Promise.all(approvers.map(async (approver) => await encrypt(approver)));
    
          if (id) {
            // Update logic
            const updatedData = {
              module: await encrypt(module),
              l1approvers: await encryptApprovers(l1approvers),
              l2approvers: await encryptApprovers(l2approvers || []),
              l3approvers: await encryptApprovers(l3approvers || []),
              updatedAt: new Date(),
            };
    
            const updateResult = await collection.updateOne(
              { _id: ObjectId(id) },
              { $set: updatedData }
            );
    
            if (updateResult.matchedCount === 0) {
              return res.status(responseCodes.NOT_FOUND).json({
                success: false,
                statusCode: responseCodes.NOT_FOUND,
                message: "Approver flow not found for the given ID.",
              });
            }
    
            return res.status(responseCodes.SUCCESS).json({
              success: true,
              statusCode: responseCodes.SUCCESS,
              message: "Approver flow updated successfully.",
            });
          } else {
            // Create logic
            const newData = {
              module: await encrypt(module),
              l1approvers: await encryptApprovers(l1approvers),
              l2approvers: await encryptApprovers(l2approvers || []),
              l3approvers: await encryptApprovers(l3approvers || []),
              isDeleted:await encrypt(false),
              createdAt: new Date(),
              updatedAt: new Date(),
            };
    
            const createResult = await collection.insertOne(newData);
    
            return res.status(responseCodes.SUCCESS).json({
              success: true,
              statusCode: responseCodes.SUCCESS,
              message: "Approver flow created successfully.",
              data: {
                id: createResult.insertedId,
              },
            });
          }
        } catch (e) {
          console.error(e);
          res.status(responseCodes.SERVER_ERROR).json({
            success: false,
            statusCode: responseCodes.SERVER_ERROR,
            message: APIMessages.SERVER_ERROR,
          });
        }
      });
      const deleteApprovalFlowById = async (req, res) =>
        connectDatabase(async (collections) => {
          try {
            const reqbody = req.method === "GET" ? req.query : req.body;
            const { id } = reqbody;
      
            const reqBodyValidation = Joi.object({
              id: Joi.string() .required()
            });
      
            const validationBody = { id };
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
      
            const trueValue = await encrypt(true);
            const resultSet = await collections.approval_control_config.updateOne(
              { _id: ObjectId(id) },
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

module.exports = {
  connectDatabase,
  handleUpdateConfig: (req, res) => handleUpdateConfig(req, res),
  handleEmailConfig: (req, res) => handleEmailConfig(req, res),
  handleEmailTemplate: (req, res) => handleEmailTemplate(req, res),
  getConfig: (req, res) => getConfig(req, res),
  saveCLIConfig: (req, res) => saveCLIConfig(req, res),
  getApproverFlows: (req, res) => getApproverFlows(req, res),
  handleApproverFlow: (req, res) => handleApproverFlow(req, res),
  deleteApprovalFlowById: (req, res) => deleteApprovalFlowById(req, res),
};
