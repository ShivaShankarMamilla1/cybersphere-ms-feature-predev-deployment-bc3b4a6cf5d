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

const handleDirectoryGroup = async (req, res) =>
    connectDatabase(async (collections) => {
        try {
            const { group_name, directories, groupId, username } = req.body;
            const requestBodySchema = Joi.object({
                group_name: Joi.string().required(),
                directories: Joi.array().items(Joi.string()).required(),
                groupId: Joi.string().custom(objectIdValidator, "Object Id validation"),
                username: Joi.string().required(),

            });

            const validationResult = requestBodySchema.validate({
                group_name,
                directories,
                groupId,
                username
            });

            if (directories.length === 0) {
                return res.status(responseCodes.ERROR).json({
                    success: false,
                    statusCode: responseCodes.ERROR,
                    message: "Please select directory",
                });
            }


            if (validationResult.error) {
                return res.status(responseCodes.ERROR).json({
                    success: false,
                    statusCode: responseCodes.ERROR,
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
            const directoryGroupData = {
                group_name: await encrypt(group_name),
                directories: await Promise.all(directories.map(async (dir) => await encrypt(dir))),
                isDeleted: await encrypt(false),
            };

            let resultSet;
            if (groupId) {
                const existingGroup = await collections.directory_groups.findOne({
                    _id: ObjectId(groupId),
                });

                if (!existingGroup) {
                    return res.status(responseCodes.NOT_FOUND).json({
                        success: false,
                        statusCode: responseCodes.NOT_FOUND,
                        message: "Directory group not found",
                    });
                }

                existingGroup.group_name = existingGroup.group_name ? await decrypt(existingGroup.group_name) : "";
                existingGroup.directories = existingGroup.directories ? await Promise.all(existingGroup.directories.map(async (dir) => await decrypt(dir))) : []
                existingGroup.createdBy = existingGroup.createdBy ? await decrypt(existingGroup.createdBy) : "";
                existingGroup.updatedBy = existingGroup.createdBy ? await decrypt(existingGroup.updatedBy) : "";

                directoryGroupData.updatedAt = new Date();
                directoryGroupData.updatedBy = username ? await encrypt(username) : "";

                resultSet = await collections.directory_groups.findOneAndUpdate(
                    { _id: ObjectId(groupId) },
                    { $set: directoryGroupData }
                );

                const updateResult = await collections.directory_groups.findOneAndUpdate(
                    { _id: ObjectId(groupId) },
                    { $set: directoryGroupData },
                    {
                        upsert: true,
                        returnDocument: "after",
                    }
                );
                const updatedRecord = updateResult?.value ?? {};

                updatedRecord.group_name = updatedRecord.group_name ? await decrypt(updatedRecord.group_name) : "";
                updatedRecord.directories = updatedRecord.directories ? await Promise.all(updatedRecord.directories.map(async (dir) => await decrypt(dir))) : []
                updatedRecord.createdBy = updatedRecord.createdBy ? await decrypt(updatedRecord.createdBy) : "";
                updatedRecord.updatedBy = updatedRecord.createdBy ? await decrypt(updatedRecord.updatedBy) : "";

                let changes = {};

                const changedFieldValues = getChangedFields(existingGroup, updatedRecord);

                handleCreateLogFun(collections, {
                    ip: "",
                    username: username,
                    actionType: "Update Directory Group",
                    module: "Directory Group",
                    prevValue: existingGroup,
                    changes: changes,
                    fieldChanged: changedFieldValues,
                    updatedValue: updatedRecord,
                });
            } else {

                directoryGroupData.createdAt = new Date();
                (directoryGroupData.createdBy = username ? await encrypt(username) : "");
                const exitUsers = await collections.directory_groups.findOne({ group_name: directoryGroupData.group_name, isDeleted: await encrypt(false) });
                if (exitUsers) {
                    return res.status(responseCodes.ERROR).json({
                        flag: "error",
                        error: "Directory Group already exists",
                    });
                }

                resultSet = await collections.directory_groups.insertOne(directoryGroupData);
                const updatedRecords = resultSet?.ops[0];


                updatedRecords.group_name = updatedRecords.group_name ? await decrypt(updatedRecords.group_name) : "";
                updatedRecords.directories = updatedRecords.directories ? await Promise.all(updatedRecords.directories.map(async (dir) => await decrypt(dir))) : []
                updatedRecords.createdBy = updatedRecords.createdBy ? await decrypt(updatedRecords.createdBy) : "";
                updatedRecords.updatedBy = updatedRecords.createdBy ? await decrypt(updatedRecords.updatedBy) : "";
                updatedRecords.isDeleted = await decrypt(updatedRecords.isDeleted) === "true";

                const changedFieldValues = getChangedFields({}, updatedRecords);

                if (resultSet) {
                    handleCreateLogFun(collections, {
                        ip: "",
                        username: username,
                        actionType: "Create Directory Group",
                        module: "Directory Group",
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
                message: "API executed successfully",
            });
        } catch (error) {
            console.error(error);
            return res.status(responseCodes.SERVER_ERROR).json({
                success: false,
                statusCode: responseCodes.SERVER_ERROR,
                message: "An error occurred while handling the directory group",
            });
        }
    });

const createNewDirectory = async (req, res) =>
    connectDatabase(async (collections) => {
        try {
            const reqbody = req.method === "GET" ? req.query : req.body;
            const { username, newDirectory, serviceAccountId } = reqbody;

            const userRequestBody = Joi.object({
                newDirectory: Joi.string().allow("").required(),
                username: Joi.string().required(),
                serviceAccountId: Joi.string().custom(objectIdValidator, "Object Id validation").required(),
            });

            const dirObj = {
                username,
                newDirectory,
                serviceAccountId
            };

            const validationResult = userRequestBody.validate(dirObj);

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

            const existingRecord = await collections.service_account_users.findOne({ _id: ObjectId(serviceAccountId) });

            if (!existingRecord) {
                return res.status(responseCodes.SUCCESS).json({
                    success: false,
                    statusCode: responseCodes.ERROR,
                    message: "No record with Id",
                });
            }

            existingRecord.allowedSudoers = existingRecord.allowedSudoers ? await Promise.all((existingRecord.allowedSudoers).map(async (usr) => await decrypt(usr))) : [];
            existingRecord.directory = existingRecord.directory ? await Promise.all((existingRecord.directory).map(async (usr) => await decrypt(usr))) : [];

            if (existingRecord.directory.includes(newDirectory)) {
                return res.status(responseCodes.SUCCESS).json({
                    success: false,
                    statusCode: responseCodes.ERROR,
                    message: "Directory already exist!",
                });
            }
            const newDirectoryArray = newDirectory ? [newDirectory] : [];
            const combinedDirectory = [...existingRecord.directory, ...newDirectoryArray];

            const serviceAccObj = {
                directory: combinedDirectory
            };

            serviceAccObj.directory = serviceAccObj.directory && serviceAccObj.directory.length > 0
                ? await Promise.all(serviceAccObj.directory.map(async (usr) => await encrypt(usr)))
                : [];

            const resultSet = await collections.service_account_users.updateOne(
                { _id: ObjectId(serviceAccountId) },
                { $set: serviceAccObj },
                { returnDocument: "after" }
            );

            if (resultSet) {
                const updatedRecord = await collections.service_account_users
                    .findOne({ _id: ObjectId(serviceAccountId) });

                updatedRecord.allowedSudoers = updatedRecord?.allowedSudoers ? await Promise.all(updatedRecord.allowedSudoers.map(async (usr) => await decrypt(usr))) : [];
                updatedRecord.directory = updatedRecord?.directory ? await Promise.all(updatedRecord.directory.map(async (usr) => await decrypt(usr))) : [];

                let changes = {};

                const changedFieldValues = getChangedFields(existingRecord, updatedRecord);

                handleCreateLogFun(collections, {
                    ip: "",
                    username: username,
                    actionType: "Updated Sudoers",
                    module: "Service Account",
                    prevValue: existingRecord,
                    changes: changes,
                    fieldChanged: changedFieldValues,
                    updatedValue: updatedRecord,
                });
            }

            return res.status(responseCodes.SUCCESS).json({
                success: true,
                statusCode: responseCodes.SUCCESS,
                message: "API executed successfully",
            });
        } catch (error) {
            console.error(error);
            return res.status(responseCodes.SERVER_ERROR).json({
                success: false,
                statusCode: responseCodes.SERVER_ERROR,
                message: "An error occurred while creating directory",
            });
        }
    });

const getDirectoryGroup = async (req, res) =>
    connectDatabase(async (collections) => {
        try {
            const reqbody = req.method === "GET" ? req.query : req.body;

            const limit = parseInt(reqbody.pageSize) || 10;
            const pageNo = parseInt(reqbody.pageNo - 1) || 0;
            const skip = pageNo * limit;

            const falseValue = false;
            const searchFilter = {
                isDeleted: await encrypt(falseValue)
            };
            const sortFilter = { updatedAt: -1 };

            const configReqBodyValidation = Joi.object({
                limit: Joi.number().required(),
                pageNo: Joi.number().required(),
            });

            const validationBody = { limit, pageNo };

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

            // Pagination logic only if limit is not 0
            let resultSet;
            if (limit > 0) {
                resultSet = await collections.directory_groups
                    .find(searchFilter)
                    .skip(skip)
                    .limit(limit)
                    .collation({ locale: "en", strength: 2 })
                    .sort(sortFilter)
                    .toArray();
            }

            for (const r of resultSet) {
                r.group_name = await decrypt(r.group_name);
                r.directories = await Promise.all(r.directories.map(async (dir) => await decrypt(dir)))
                r.createdBy = await decrypt(r.createdBy);
                r.updatedBy = await decrypt(r.updatedBy);
                r.isDeleted = await decrypt(r.isDeleted) === "true";
            }

            const totalCount = await collections.directory_groups.countDocuments(
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

const getDirectoryGroupList = async (req, res) =>
    connectDatabase(async (collections) => {
        try {
            const searchFilter = {
                isDeleted: await encrypt(false),
            };
            const sortFilter = { name: 1 };

            const resultSet = await collections.directory_groups
                .find(searchFilter, { projection: { group_name: 1 } })
                .collation({ locale: "en", strength: 2 })
                .sort(sortFilter)
                .toArray();

            const groupNames = await Promise.all(
                resultSet.map(async (r) => await decrypt(r.group_name))
            );

            res.status(responseCodes.SUCCESS).json({
                flag: "success",
                message: APIMessages.SUCCESS,
                data: groupNames ?? [],
            });
        } catch (error) {
            res.status(responseCodes.SERVER_ERROR).json({
                flag: "error",
                error: error.message,
                message: APIMessages.SERVER_ERROR,
            });
        }
    });


const deleteDirectoryGroup = async (req, res) =>
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
            const resultSet = await collections.directory_groups.findOneAndUpdate({ _id: ObjectId(groupId) },
                {
                    $set: { isDeleted: await encrypt(trueValue) },

                }, {
                upsert: true,
                returnDocument: "after",
            });

            const group_name = await decrypt(resultSet.value.group_name)
            if (resultSet) {
                handleCreateLogFun(collections, {
                    ip: "",
                    username: username,
                    actionType: "Delete Directory Group",
                    module: "Directory Group",
                    prevValue: ObjectId(groupId),
                    changes: "Record Deleted",
                    updatedValue: `"${group_name ?? ObjectId(groupId)}" server group deleted`,
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
    handleDirectoryGroup: (req, res) => handleDirectoryGroup(req, res),
    createNewDirectory: (req, res) => createNewDirectory(req, res),
    getDirectoryGroup: (req, res) => getDirectoryGroup(req, res),
    deleteDirectoryGroup: (req, res) => deleteDirectoryGroup(req, res),
    getDirectoryGroupList: (req, res) => getDirectoryGroupList(req, res),
};
