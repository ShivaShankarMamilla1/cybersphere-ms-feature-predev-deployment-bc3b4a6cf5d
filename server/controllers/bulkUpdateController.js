const db = require("../database/connection");
const responseCodes = require("../utils/responseCodes");
const APIMessages = require("../utils/messages");
const { encrypt } = require("../utils/encryptFunctions");

const connectDatabase = async (callback) => {
    try {
        const collections = await db.connectToDatabase();
        return await callback(collections);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error occurred: ${error}`);
    }
};

// run bulk update only once
const bulkUpdateForADGroup = async (req, res) =>
    connectDatabase(async (collections) => {
        try {

            const groups = await collections.adgroups.find().toArray();

            for await (const ad of groups) {

                ad.group = await encrypt(ad.group)
                ad.usernames = await encrypt(ad.usernames)
                ad.isGroupUsed = await encrypt(ad.isGroupUsed)
                ad.approverDetails = await encrypt(JSON.stringify(ad.approverDetails))

                const upObj = {
                    group: ad.group,
                    usernames: ad.usernames,
                    isGroupUsed: ad.isGroupUsed,
                    approverDetails: ad.approverDetails
                }

                await collections.adgroups.updateOne({ _id: ad._id }, { $set: upObj });
            }

            res.status(responseCodes.SUCCESS).json({
                flag: "success",
                message: "Bulk Update Successful",
            });
        } catch (error) {
            res.status(responseCodes.SERVER_ERROR).json({
                flag: "error",
                error: error.message,
                message: APIMessages.SERVER_ERROR,
            });
        }
    });

const bulkUpdateForCommandGroup = async (req, res) =>
    connectDatabase(async (collections) => {
        try {

            const groups = await collections.groupconfig.find().toArray();

            for await (const cmd of groups) {

                cmd.name = await encrypt(cmd.name)
                cmd.updatedBy = await encrypt(cmd.updatedBy)
                cmd.createdBy = await encrypt(cmd.createdBy)
                cmd.commands = await encrypt(JSON.stringify(cmd.commands))

                const upObj = {
                    name: cmd.name,
                    commands: cmd.commands,
                    createdBy: cmd.createdBy,
                    updatedBy: cmd.updatedBy,
                }

                await collections.groupconfig.updateOne({ _id: cmd._id }, { $set: upObj });
            }

            res.status(responseCodes.SUCCESS).json({
                flag: "success",
                message: "Bulk Update Successful",
            });
        } catch (error) {
            res.status(responseCodes.SERVER_ERROR).json({
                flag: "error",
                error: error.message,
                message: APIMessages.SERVER_ERROR,
            });
        }
    });

const bulkUpdateForServerGroup = async (req, res) =>
    connectDatabase(async (collections) => {
        try {

            const groups = await collections.server_group.find().toArray();

            for await (const g of groups) {

                g.group_name = await encrypt(g.group_name)
                g.updatedBy = await encrypt(g.updatedBy)
                g.createdBy = await encrypt(g.createdBy)
                g.server = await encrypt(JSON.stringify(g.server))

                const upObj = {
                    group_name: g.group_name,
                    server: g.server,
                    createdBy: g.createdBy,
                    updatedBy: g.updatedBy,
                }

                await collections.server_group.updateOne({ _id: g._id }, { $set: upObj });
            }

            res.status(responseCodes.SUCCESS).json({
                flag: "success",
                message: "Bulk Update Successful",
            });
        } catch (error) {
            res.status(responseCodes.SERVER_ERROR).json({
                flag: "error",
                error: error.message,
                message: APIMessages.SERVER_ERROR,
            });
        }
    });

const bulkUpdateForCLI = async (req, res) =>
    connectDatabase(async (collections) => {
        try {

            const groups = await collections.cli_audit_logs.find().toArray();

            for await (const g of groups) {

                g.username = await encrypt(g.username)
                g.module = await encrypt(g.module)
                g.actionType = await encrypt(g.actionType)
                g.ip = await encrypt(g.ip)
                g.hostname = await encrypt(g.hostname)
                g.command = await encrypt(g.command)

                const upObj = {
                    username: g.username,
                    module: g.module,
                    actionType: g.actionType,
                    ip: g.ip,
                    hostname: g.hostname,
                    command: g.command,
                }

                await collections.cli_audit_logs.updateOne({ _id: g._id }, { $set: upObj });
            }

            res.status(responseCodes.SUCCESS).json({
                flag: "success",
                message: "Bulk Update Successful",
            });
        } catch (error) {
            res.status(responseCodes.SERVER_ERROR).json({
                flag: "error",
                error: error.message,
                message: APIMessages.SERVER_ERROR,
            });
        }
    });

const bulkUpdateBlacklisted = async (req, res) =>
    connectDatabase(async (collections) => {
        try {

            const groups = await collections.blacklistedCommands.find().toArray();

            for await (const g of groups) {

                g.username = await encrypt(g.username)
                g.commands = await encrypt(JSON.stringify(g.commands))

                const upObj = {
                    username: g.username,
                    commands: g.commands,
                }

                await collections.blacklistedCommands.updateOne({ _id: g._id }, { $set: upObj });
            }

            res.status(responseCodes.SUCCESS).json({
                flag: "success",
                message: "Bulk Update Successful",
            });
        } catch (error) {
            res.status(responseCodes.SERVER_ERROR).json({
                flag: "error",
                error: error.message,
                message: APIMessages.SERVER_ERROR,
            });
        }
    });
    const bulkUpdateServiceAccountUsers = async (req, res) =>
        connectDatabase(async (collections) => {
            try {
    
                const accounts = await collections.service_account_users.find().toArray();
    
                for await (const g of accounts) {
    
                    g.allowedSubUsers =  await Promise.all(
                        g.allowedSubUsers.map(async (cmd) => await encrypt(cmd))
                      )
    
                    const upObj = {
                        allowedSubUsers: g.allowedSubUsers,
                    }
    
                    await collections.service_account_users.updateOne({ _id: g._id }, { $set: upObj });
                }
    
                res.status(responseCodes.SUCCESS).json({
                    flag: "success",
                    message: "Bulk Update Successful",
                });
            } catch (error) {
                res.status(responseCodes.SERVER_ERROR).json({
                    flag: "error",
                    error: error.message,
                    message: APIMessages.SERVER_ERROR,
                });
            }
        });


const bulkUpdateForRequests = async (req, res) =>
    connectDatabase(async (collections) => {
        try {

            const groups = await collections.requestaccess.find().toArray();

            for await (const g of groups) {

                g.adGroup = await encrypt(g.adGroup)
                g.commandType = await encrypt(g.commandType)
                g.isAllowed = await encrypt(g.isAllowed)
                g.commandGroupName = await encrypt(g.commandGroupName)
                g.isCommandGroupSelected = await encrypt(g.isCommandGroupSelected)
                g.serverGroupName = await encrypt(g.serverGroupName)
                g.isServerGroupSelected = await encrypt(g.isServerGroupSelected)
                g.requestedBy = await encrypt(g.requestedBy)
                g.status = await encrypt(g.status)
                g.approver = await encrypt(g.approver)
                g.reason = await encrypt(g.reason)
                g.approverReason = await encrypt(g.approverReason)
                g.servers = await Promise.all(g.servers.map(async (server) => await encrypt(server)));
                g.commands = await Promise.all(g.commands.map(async (command) => await encrypt(command)));

                const upObj = {
                    adGroup: g.adGroup,
                    commandType: g.commandType,
                    isAllowed: g.isAllowed,
                    commandGroupName: g.commandGroupName,
                    isCommandGroupSelected: g.isCommandGroupSelected,
                    serverGroupName: g.serverGroupName,
                    isServerGroupSelected: g.isServerGroupSelected,
                    requestedBy: g.requestedBy,
                    status: g.status,
                    approver: g.approver,
                    reason: g.reason,
                    approverReason: g.approverReason,
                    servers: g.servers,
                    commands: g.commands,
                }

                await collections.requestaccess.updateOne({ _id: g._id }, { $set: upObj });
            }

            res.status(responseCodes.SUCCESS).json({
                flag: "success",
                message: "Bulk Update Successful",
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
    bulkUpdateForADGroup: (req, res) => bulkUpdateForADGroup(req, res),
    bulkUpdateForCommandGroup: (req, res) => bulkUpdateForCommandGroup(req, res),
    bulkUpdateForServerGroup: (req, res) => bulkUpdateForServerGroup(req, res),
    bulkUpdateForCLI: (req, res) => bulkUpdateForCLI(req, res),
    bulkUpdateBlacklisted: (req, res) => bulkUpdateBlacklisted(req, res),
    bulkUpdateForRequests: (req, res) => bulkUpdateForRequests(req, res),
    bulkUpdateServiceAccountUsers: (req, res) => bulkUpdateServiceAccountUsers(req, res),
};