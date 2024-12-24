/* eslint-disable no-unused-vars */
const Joi = require("joi");
const { ObjectId } = require("mongodb");
const db = require("../database/connection");
const responseCodes = require("../utils/responseCodes");
const APIMessages = require("../utils/messages");
const {
  handleCreateNotificationFun,
  handleCreateLogFun,
} = require("../controllers/agentController");
const { sendEmail } = require("../utils/mailer");
const { executeRustCommand } = require("../services/agentService");
const { encrypt, decrypt } = require("../utils/encryptFunctions");
const cmdUtil = require("../utils/commandPermissionUtil");
const { getFileFromS3 } = require("../utils/awsConnection");

const connectDatabase = async (callback) => {
  try {
    const collections = await db.connectToDatabase();
    return await callback(collections);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error occurred: ${error}`);
  }
};

const getFileAndSendResponse = async (req, res, fileKey) => {
  try {
    const binaryRes = await getFileFromS3(fileKey);

    if (binaryRes) {
      const fileName = fileKey.split("/").pop();
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      binaryRes.pipe(res).on("error", (error) => {
        console.error("Stream Error:", error);
        res.status(responseCodes.SERVER_ERROR).json({
          flag: "error",
          error: error.message,
          message: APIMessages.SERVER_ERROR,
        });
      });
    } else {
      res.status(responseCodes.SUCCESS).json({
        flag: "error",
        message: "No File Found",
      });
    }

  } catch (error) {
    res.status(responseCodes.SERVER_ERROR).json({
      flag: "error",
      error: error.message,
      message: APIMessages.SERVER_ERROR,
    });
  }
};

const getCybersphereBinary = async (req, res) => {
  const fileKey = "predev/cybersphere1.0.0";
  await getFileAndSendResponse(req, res, fileKey);
};

const getCybersphereProfileScript = async (req, res) => {
  const fileKey = "predev/scripts/cybersphere_script.sh";
  await getFileAndSendResponse(req, res, fileKey);
};



const executeCommand = async (req, res) =>
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

      for (const ad of resultSet) {
        ad.commandType = await decrypt(ad.commandType);
        ad.isAllowed = await decrypt(ad.isAllowed);
        ad.isCommandGroupSelected = await decrypt(ad.isCommandGroupSelected);
        ad.serverGroupName = await decrypt(ad.serverGroupName);
        ad.isServerGroupSelected = await decrypt(ad.isServerGroupSelected);
        ad.isUsersModified = await decrypt(ad.isUsersModified);
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

const verifyUserPermissions = async (req, res) => {
  try {
    await connectDatabase(async (collections) => {
      const user = req.body.user;
      const command = req.body.command;
      const hostname = req.body.hostname;
      const ip = req.ip || req.connection.remoteAddress;

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
            const commandGroupNames = await Promise.all(
              user.commandGroupName
                .split(",")
                .map((name) => encrypt(name.trim()))
            );
            const commandGroups = await collections.groupconfig
              .find({ name: { $in: commandGroupNames } })
              .toArray();

            for (const group of commandGroups) {
              if (group.commands) {
                const decryptedCommands = JSON.parse(
                  await decrypt(group.commands)
                );
                allCommands = [...allCommands, ...decryptedCommands];
              }
            }
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

        handleCreateLogFun(collections, {
          ip: ip,
          username: user,
          actionType: "User unauthorized and attempted blacklisted command",
          module: "cli",
          command,
          hostname: hostname,
        });
      } else if (isBlacklisted) {
        message = "The command is blacklisted and cannot be executed.";
        await handleCreateNotificationFun(collections, {
          message: `User ${user} attempted to execute blacklisted command`,
          type: "Alert",
          username: user,
          command,
        });

        handleCreateLogFun(collections, {
          ip: ip,
          username: user,
          actionType: "Blacklisted Command",
          module: "cli",
          command,
          hostname: hostname,
        });
      } else if (!isAuthorize) {
        message = "User is not authorized to execute the command.";
        await handleCreateNotificationFun(collections, {
          message: `Unauthorized command execution attempt by ${user}`,
          type: "Warning",
          username: user,
          command,
        });

        handleCreateLogFun(collections, {
          ip: ip,
          username: user,
          actionType: "User Unauthorized",
          module: "cli",
          command,
          hostname: hostname,
        });
      } else if (currentDate > isServerInGroup?.endDate) {
        isAuthorize = false;
        message = "User access has expired.";
        handleCreateLogFun(collections, {
          ip: ip,
          username: user,
          actionType: "User authorized and access expired",
          module: "cli",
          command,
          hostname: hostname,
        });
      } else {
        message = "User is authorized to execute the command.";
        handleCreateLogFun(collections, {
          ip: ip,
          username: user,
          actionType: "User authorized and executed commands",
          module: "cli",
          command,
          hostname: hostname,
        });
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

const verifyAndExecute = async (req, res) => {
  try {
    await connectDatabase(async (collections) => {
      const { user, command, hostname } = req.body;
      const ip = req.ip || req.connection.remoteAddress;
      let data;
      let message;
      let actionTypeMessageForLogs = "";

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

      const encryptedUser = await encrypt(user);
      const userResult = await collections.users
        .find({
          usernames: { $in: [encryptedUser] },
          endDate: { $gt: new Date() },
        })
        .toArray();

      if (userResult.length === 0) {
        actionTypeMessageForLogs = "User Authorized and Access Expired";
        handleCreateLogFun(collections, {
          ip: ip,
          username: user,
          actionType: actionTypeMessageForLogs,
          module: "cli",
          command,
          hostname: hostname,
        });

        return res.status(responseCodes.SUCCESS).json({
          flag: "error",
          message: "User access has expired.",
        });
      }

      let allServers = [];
      let allCommands = [];

      for (const ad of userResult) {
        ad.adGroup = await decrypt(ad.adGroup);
        ad.commandType = await decrypt(ad.commandType);
        ad.isAllowed = await decrypt(ad.isAllowed);
        ad.commandGroupName = await decrypt(ad.commandGroupName);
        ad.isCommandGroupSelected = await decrypt(ad.isCommandGroupSelected);
        ad.serverGroupName = await decrypt(ad.serverGroupName);
        ad.isServerGroupSelected = await decrypt(ad.isServerGroupSelected);
        ad.isUsersModified = await decrypt(ad.isUsersModified);
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

      for (const user of userResult) {
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
          allServers = [...allServers, ...user.servers];
        }

        if (user.isAllowed) {
          if (user.isCommandGroupSelected) {
            const commandGroupNames = await Promise.all(
              user.commandGroupName
                .split(",")
                .map((name) => encrypt(name.trim()))
            );
            const commandGroups = await collections.groupconfig
              .find({ name: { $in: commandGroupNames } })
              .toArray();

            for (const group of commandGroups) {
              if (group.commands) {
                const decryptedCommands = await Promise.all(
                  group.commands.map(async (cmd) => await decrypt(cmd))
                );
                allCommands = [...allCommands, ...decryptedCommands];
              }
            }
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

      const blacklisted = await collections.blacklistedCommands.findOne({});
      blacklisted.commands = await decrypt(blacklisted.commands);
      let isAuthorize = isServerInGroup ? isAuth : false;
      const isBlacklisted = blacklisted.commands?.includes(command);
      if (isBlacklisted && !isAuthorize) {
        message =
          "The command is blacklisted and the user is not authorized to execute it.";
        handleCreateNotificationFun(collections, {
          message: `User ${user} attempted to execute blacklisted command`,
          type: "Alert",
          username: user,
          command,
        });
        sendEmail({
          message: `User ${user} attempted to execute blacklisted command`,
          type: "Alert",
          username: user,
          command,
          hostname,
        });
        actionTypeMessageForLogs =
          "User Unauthorized And Attempted Blacklisted Command";
      } else if (isBlacklisted) {
        message = "The command is blacklisted and cannot be executed.";
        handleCreateNotificationFun(collections, {
          message: `User ${user} attempted to execute blacklisted command`,
          type: "Alert",
          username: user,
          command,
        });
        sendEmail({
          message: `User ${user} attempted to execute blacklisted command`,
          type: "Alert",
          username: user,
          command,
          hostname,
        });
        actionTypeMessageForLogs = "Blacklisted Command";
      } else if (!isAuthorize) {
        message = "User is not authorized to execute the command.";
        handleCreateNotificationFun(collections, {
          message: `Unauthorized command execution attempt by ${user}`,
          type: "Warning",
          username: user,
          command,
        });
        sendEmail({
          message: `Unauthorized command execution attempt by ${user}`,
          type: "Warning",
          username: user,
          command,
          hostname,
        });
        actionTypeMessageForLogs = "User Unauthorized";
      } else if (currentDate > isServerInGroup?.endDate) {
        isAuthorize = false;
        message = "User access has expired.";
        actionTypeMessageForLogs = "User Authorized and Access Expired";
      } else {
        message = "User is authorized to execute the command.";
        actionTypeMessageForLogs = "User Authorized And Executed Commands";
        data = await executeRustCommand({ hostname, command });
      }

      handleCreateLogFun(collections, {
        ip: ip,
        username: user,
        actionType: actionTypeMessageForLogs,
        module: "cli",
        command,
        hostname: hostname,
      });

      res.status(responseCodes.SUCCESS).json({
        isAuthorize,
        isBlacklisted,
        message,
        commandType: userResult?.commandType || "",
        adGroup: userResult?.adGroup || "",
        data:
          data?.code === "ETIMEDOUT"
            ? { message: "Could not connect to sever!" }
            : data?.data ?? {},
      });
    });
  } catch (error) {
    console.log(error);
    res
      .status(responseCodes.SERVER_ERROR)
      .json({ isAuthorize: false, message: "An error occurred" + error });
  }
};

const commandPermissions = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;
      const { server, user } = reqbody;
      const configReqBodyValidation = Joi.object({
        server: Joi.string().required(),
        user: Joi.string().required(),
      });

      const validationResult = configReqBodyValidation.validate({
        server,
        user,
      });
      if (validationResult.error) {
        return res.status(responseCodes.SUCCESS).json({
          flag: "error",
          error: validationResult.error.message.replace(
            /"([^"]+)"/,
            (match, p1) =>
              p1
                .replace(/([a-z])([A-Z])/g, "$1 $2")
                .replace(/^\w/, (c) => c.toUpperCase())
          ),
        });
      }
      const encryptedUser = await encrypt(user);
      const irisUser = await collections.iamusers.findOne({
        jnjMSUsername: { $regex: `^${user}$`, $options: "i" }
      })
      const ciName = await collections.cybersphere_servers.findOne(
        { hostname: server },
        { projection: { "cmdb.ciSapName": 1 } }
      )
      let irisData = '';
      let irisFilteredData = [];

      try {
        irisData = await cmdUtil(server,ciName?.cmdb?.ciSapName);
      } catch (err) {
        console.log(err,"IRIS err");
      }
      console.log(`IAM USERID: ${irisUser?.sub || 'Not available'} for requested user`);

      if (irisData && irisData?.tasks && irisData?.tasks?.length && irisUser) {

        irisFilteredData = irisData.tasks
          .filter((task) => task.assignedTo.includes(irisUser?.sub)) 
          .flatMap((task) => {
            console.log(`Task filters found: These task is in progress and assigned to user: ${JSON.stringify(task)}`);
            const descriptions = task.description.split(/\r\n/).filter(Boolean);
            return descriptions.map((desc) => ({
              validUpto: irisData?.end_date ? Math.floor(new Date(irisData?.end_date).getTime() / 1000) : null,
              CTask: task?.taskNumber || null,
              description: desc.trim(),
              CRNumber: irisData?.changeRequestNumber || null
            }));
          });
      }
      let blacklistedCommands = [];
      let allowedSubUserList = [];
      let allowedGroup = [];
      let restrictedCommands = [];
      let defaultRestrictedCommands = [];
      let userApprovedRestrictedCommands = [];
      // Fetch blacklisted commands
      const blacklistedData = await collections.blacklistedCommands.findOne();
      // Fetch Allowed Sub Users commands
      const allowedSubUserListData =
        await collections.service_account_users.findOne();

      if (blacklistedData && blacklistedData?.commands?.length) {
        blacklistedCommands = await Promise.all(
          blacklistedData?.commands.map(async (cmd) => await decrypt(cmd))
        );
      }

      if (
        allowedSubUserListData &&
        allowedSubUserListData?.allowedSubUsers?.length
      ) {
        allowedSubUserList = await Promise.all(
          allowedSubUserListData.allowedSubUsers.map(
            async (cmd) => await decrypt(cmd)
          )
        );
      }

      if (
        allowedSubUserListData &&
        allowedSubUserListData?.groupConfiguration?.length
      ) {
        allowedGroup = await Promise.all(
          allowedSubUserListData.groupConfiguration.map(
            async (cmd) => await decrypt(cmd)
          )
        );
      }

      const restrictedData = await collections.users
        .find({ username: encryptedUser, isDeleted: await encrypt(false) })
        .collation({ locale: "en", strength: 2 })
        .toArray();

      const isUserBlocked =
        restrictedData?.length > 0 &&
        (await decrypt(restrictedData[0].isUserBlocked)) === "true";

      for (const ad of restrictedData) {
        ad.adGroup = await decrypt(ad.adGroup);
        ad.commandType = await decrypt(ad.commandType);
        ad.isAllowed = await decrypt(ad.isAllowed);
        ad.isCommandGroupSelected = await decrypt(ad.isCommandGroupSelected);
        ad.isServerGroupSelected = await decrypt(ad.isServerGroupSelected);
        ad.isUsersModified = await decrypt(ad.isUsersModified);
        ad.servers = await Promise.all(
          ad.servers.map(async (server) => await decrypt(server))
        );
        ad.commands = await Promise.all(
          ad.commands.map(async (command) => {
            const c = await decrypt(command);
            return c;
          })
        );
        ad.username = await decrypt(ad.username);
      }
      let allGroupConfigData = await collections.groupconfig
        .find({ isDeleted: await encrypt(false) })
        .collation({ locale: "en", strength: 2 })
        .toArray();

      for (const r of allGroupConfigData) {
        r.name = await decrypt(r.name);
        r.createdBy = await decrypt(r.createdBy);
        r.updatedBy = await decrypt(r.updatedBy);
        r.commands = await Promise.all(
          r.commands.map(async (cmd) => {
            const directoryGroups = cmd.directoryGroup ?? [];
            let directoryData = await collections.directory_groups
              .find({ group_name: { $in: directoryGroups }, isDeleted: await encrypt(false) })
              .collation({ locale: "en", strength: 2 })
              .toArray();
            const allDirectories = directoryData.flatMap((group) => group.directories ?? []);
            const directoryFromGrp = allDirectories?.length ? await Promise.all(allDirectories?.map(dir => decrypt(dir))) : [];
            return {
              ...cmd,
              command: await decrypt(cmd.command),
              runAsRoot: (await decrypt(cmd.runAsRoot)) === 'true',
              isSubDirectoryAllowed: (await decrypt(cmd.isSubDirectoryAllowed)) === 'true',
              isExcluded: (await decrypt(cmd.isExcluded)) === 'true',
              recordEnabled: cmd?.recordEnabled?(await decrypt(cmd.recordEnabled)) === 'true':false, 
              sudoers: cmd?.sudoers?.length ? await Promise.all(cmd.sudoers.map(sudoer => decrypt(sudoer))) : [],
              directory: [
                ...(cmd?.directory?.length
                  ? await Promise.all(cmd.directory.map(dir => decrypt(dir)))
                  : []),
                ...directoryFromGrp,
              ],
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
              const directoryGroups = cmd.directoryGroup ?? [];
              let directoryData = await collections.directory_groups
                .find({ group_name: { $in: directoryGroups }, isDeleted: await encrypt(false) })
                .collation({ locale: "en", strength: 2 })
                .toArray();
              const allDirectories = directoryData.flatMap((group) => group.directories ?? []);
              const directoryFromGrp = allDirectories?.length ? await Promise.all(allDirectories?.map(dir => decrypt(dir))) : [];

              return {
                ...cmd,
                command: await decrypt(cmd.command),
                runAsRoot: (await decrypt(cmd.runAsRoot)) === 'true', 
                isSubDirectoryAllowed: (await decrypt(cmd.isSubDirectoryAllowed)) === 'true', 
                isExcluded: (await decrypt(cmd.isExcluded)) === 'true',
                recordEnabled: cmd?.recordEnabled?(await decrypt(cmd.recordEnabled)) === 'true':false, 
                sudoers: cmd?.sudoers?.length ? await Promise.all(cmd.sudoers.map(sudoer => decrypt(sudoer))) : [],
                directory: [
                  ...(cmd?.directory?.length
                    ? await Promise.all(cmd.directory.map(dir => decrypt(dir)))
                    : []),
                  ...directoryFromGrp,
                ],
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
      let agentEnvString = "";
      const config = await collections.config_settings.findOne({});
      if (config) {
        config.isCLIEnabled = config?.isCLIEnabled ? await decrypt(config?.isCLIEnabled) === "true" : false;
      }
      const upperCseServer = server.toUpperCase()
      const exceptionServer = await collections.server_exception_list.findOne({
        server: await encrypt(upperCseServer),
        endDate: { $gt: new Date() },
        isDeleted: await encrypt(false)
      })
      let exceptionFlag = false;
      if (exceptionServer) {
        exceptionFlag = true;
      }
      if (!config?.isCLIEnabled) {
        exceptionFlag = true;
      }
      const serverInfo = {
        isServerExceptionEnabled: exceptionFlag,
        hostname: null,
        serviceName: null,
        env: null,
        region: null,
        sid: null,
        platform: null,
        ci: null,
        statusMsg: !config?.isCLIEnabled ? 'Disabled' : exceptionFlag ? 'Excluded' : 'Enabled',
        statusCode: !config?.isCLIEnabled
          ? 1
          : exceptionFlag
            ? 2
            : 0,
      }
      const agentHostInfo = await collections.cybersphere_servers.findOne({
        hostname: { $regex: `^${server}$`, $options: "i" },
      });

      if (agentHostInfo) {
        if (agentHostInfo?.cmdb?.ciSapNameEnv) {
          agentEnvString = agentHostInfo?.cmdb?.ciSapNameEnv;
        }
        serverInfo.hostname = agentHostInfo?.hostname || null
        serverInfo.env = agentHostInfo?.cmdb?.ciSapNameEnv || null
        serverInfo.region = agentHostInfo?.cmdb?.slRegion || null
        serverInfo.sid = agentHostInfo?.cmdb?.ciSapNameSid || null
        serverInfo.platform = agentHostInfo?.cmdb?.slPlatform || null
        serverInfo.serviceName = agentHostInfo?.cmdb?.slName || null
        serverInfo.ci = agentHostInfo?.cmdb?.ciSapName || null
      }

      if (restrictedData && restrictedData.length) {
        const serverGroupsRefs = restrictedData
          .flatMap((item) => item.serverGroupsRef || [])
          .map((groupId) => new ObjectId(groupId));

        const cGroupRefs = [
          ...new Set(
            restrictedData
              .flatMap((item) => item.commandGroupsRef || []) 
              .filter((ref) => ref) 
          ),
        ];

        let groupConfigData = [];
        if (cGroupRefs.length) {
          groupConfigData = allGroupConfigData.filter(
            (group) => cGroupRefs.some((ref) => ref.equals(group._id)) // Match ObjectId references
          );
        }

        // Query serverGroupData only if encryptedSGroups is not empty
        let serverGroupData = [];
        if (serverGroupsRefs.length) {
          serverGroupData = await collections.server_group
            .find({ _id: { $in: serverGroupsRefs } }) // Query by ObjectIds
            .collation({ locale: "en", strength: 2 })
            .toArray();

          for (const r of serverGroupData) {
            r.group_name = await decrypt(r.group_name);
            r.createdBy = await decrypt(r.createdBy);
            r.updatedBy = await decrypt(r.updatedBy);
            r.server = await Promise.all(
              r.server.map(async (server) => await decrypt(server))
            );
          }
        }

        // Map serverGroupData.server into restrictedData
        const serverGroupMap = new Map(
          serverGroupData.map((group) => [group._id.toString(), group.server]) // Map using ObjectId as the key
        );

        restrictedData.forEach((item) => {
          const serverGroupIds = (item.serverGroupsRef || []).map((groupId) =>
            groupId.toString()
          );
          item.mappedServers = serverGroupIds.flatMap(
            (groupId) => serverGroupMap.get(groupId) || []
          );
        });
        const filteredRestrictedData = restrictedData.filter(
          (item) =>
            item.mappedServers.some(
              (mappedServer) =>
                mappedServer.toLowerCase() === server.toLowerCase()
            ) ||
            item.servers.some(
              (itemServer) => itemServer.toLowerCase() === server.toLowerCase()
            )
        );

        const groupConfigMap = new Map(
          groupConfigData.map((group) => [group._id.toString(), group])
        );

        filteredRestrictedData.forEach((item) => {
          const commandGroupsRefs = item.commandGroupsRef || [];

          item.mappedGroups = commandGroupsRefs
            .map((ref) => groupConfigMap.get(ref.toString()))
            .filter((group) => group);
        });

        filteredRestrictedData.forEach((item) => {
          if (item?.mappedGroups?.length > 0) {
            item.mappedGroups.forEach((group) => {
              const matchingTask =
                Array.isArray(irisFilteredData) &&
                irisFilteredData.find(
                  (task) => task.description === group.name
                );
              group.commands.forEach((command) => {
                let commandMatchingTask
                if (Array.isArray(irisFilteredData) && irisFilteredData?.length && !matchingTask) {
                  commandMatchingTask = irisFilteredData.find(
                    (task) => task.description === command.command
                  );
                }
                const restrictedCommand = {
                  command: command.command,
                  recordEnabled:command.recordEnabled,
                  allowedSubUsers: command.allowedSubUsers || [],
                  allowedGroup: command.allowedSubUserGroup || [],
                  runWithSudo: !!command.runAsRoot,
                  isAllowed: isUserBlocked ? false : true,
                  validUpto: item?.endDate
                    ? Math.floor(new Date(item?.endDate).getTime() / 1000)
                    : null,
                  exclusion: false,
                  isEnvRestricted:
                    agentEnvString &&
                      Array.isArray(command.environment) &&
                      !command.environment.includes(agentEnvString)
                      ? false
                      : true,
                  isCRRequired: group.needsChangeRequest === "true",
                  CTask: null,
                  CRNumber: null,
                  ReqNumber: item?.ReqNumber || null,
                  sudoers: command?.sudoers ?? [],
                  directory: command?.directory ?? [],
                  isSubDir: !!command?.isSubDirectoryAllowed

                };
                if (matchingTask && matchingTask?.CRNumber) {
                  restrictedCommand.CRNumber = matchingTask?.CRNumber
                }
                if (matchingTask && matchingTask?.CTask) {
                  restrictedCommand.CTask = matchingTask?.CTask
                }
                if (commandMatchingTask && commandMatchingTask?.CRNumber) {
                  restrictedCommand.CRNumber = commandMatchingTask?.CRNumber
                }
                if (commandMatchingTask && commandMatchingTask?.CTask) {
                  restrictedCommand.CTask = commandMatchingTask?.CTask
                }
                if (matchingTask && matchingTask?.validUpto) {
                  restrictedCommand.validUpto = matchingTask?.validUpto
                }
                if (commandMatchingTask && commandMatchingTask?.validUpto) {
                  restrictedCommand.validUpto = commandMatchingTask?.validUpto
                }
                if (!restrictedCommand?.CRNumber && restrictedCommand?.isCRRequired && irisData?.errors) {
                  restrictedCommand.CRNumber = 'XXXX';
                }
                userApprovedRestrictedCommands.push(restrictedCommand);
              });
              if (group?.exclude && group?.exclude?.length) {
                group.exclude.forEach((command) => {
                  let commandMatchingTask
                  if (Array.isArray(irisFilteredData) && irisFilteredData?.length && !matchingTask) {
                    commandMatchingTask = irisFilteredData.find(
                      (task) => task.description === command.command
                    );
                  }
                  const restrictedCommand = {
                    command: command.command,
                    recordEnabled:command.recordEnabled,
                    allowedSubUsers: command.allowedSubUsers || [],
                    allowedGroup: command.allowedSubUserGroup || [],
                    runWithSudo: !!command.runAsRoot,
                    isAllowed: isUserBlocked ? false : true,
                    validUpto: item?.endDate
                      ? Math.floor(new Date(item?.endDate).getTime() / 1000)
                      : null,
                    exclusion: true,
                    isEnvRestricted:
                      agentEnvString &&
                        Array.isArray(command.environment) &&
                        !command.environment.includes(agentEnvString)
                        ? false
                        : true,
                    isCRRequired: group.needsChangeRequest === "true",
                    CTask: null,
                    CRNumber: null,
                    ReqNumber: item?.ReqNumber || null,
                    sudoers: command?.sudoers ?? [],
                    directory: command?.directory ?? [],
                    isSubDir: !!command?.isSubDirectoryAllowed

                  };
                  if (matchingTask && matchingTask?.CRNumber) {
                    restrictedCommand.CRNumber = matchingTask?.CRNumber
                  }
                  if (matchingTask && matchingTask?.CTask) {
                    restrictedCommand.CTask = matchingTask?.CTask
                  }
                  if (commandMatchingTask && commandMatchingTask?.CRNumber) {
                    restrictedCommand.CRNumber = commandMatchingTask?.CRNumber
                  }
                  if (commandMatchingTask && commandMatchingTask?.CTask) {
                    restrictedCommand.CTask = commandMatchingTask?.CTask
                  }
                  if (matchingTask && matchingTask?.validUpto) {
                    restrictedCommand.validUpto = matchingTask?.validUpto
                  }
                  if (commandMatchingTask && commandMatchingTask?.validUpto) {
                    restrictedCommand.validUpto = commandMatchingTask?.validUpto
                  }
                  if (!restrictedCommand?.CRNumber && restrictedCommand?.isCRRequired && irisData?.errors) {
                    restrictedCommand.CRNumber = 'XXXX';
                  }
                  userApprovedRestrictedCommands.push(restrictedCommand);
                });
              }
            });
          }
          if (item?.commands?.length) {
            item.commands.forEach((command) => {
              // Find the corresponding group in allGroupConfigData
              const matchingGroup = allGroupConfigData.find(
                (group) =>
                  group.commands.some((cmd) => cmd.command === command) ||
                  group.exclude.some((excl) => excl.command === command)
              );

              if (matchingGroup) {
                const matchingTask =
                  Array.isArray(irisFilteredData) &&
                  irisFilteredData.find((task) => task.description === matchingGroup.name);
                let commandMatchingTask
                if (Array.isArray(irisFilteredData) && irisFilteredData?.length && !matchingTask) {
                  commandMatchingTask = irisFilteredData.find(
                    (task) => task.description === command
                  );
                }
                // Determine if the command is in commands or exclude array
                const commandInGroup = matchingGroup.commands.find((cmd) => cmd.command === command);
                const commandInExclude = matchingGroup.exclude.find((excl) => excl.command === command);

                const restrictedCommand = {
                  command: command, // Use the command from `item.commands`
                  recordEnabled:command.recordEnabled,
                  allowedSubUsers: command.allowedSubUsers || [],
                  allowedGroup: command.allowedSubUserGroup || [],
                  runWithSudo: commandInGroup?.runAsRoot || commandInExclude?.runAsRoot || false, // Command-based `runAsRoot`
                  isAllowed: isUserBlocked ? false : true,
                  validUpto: item?.endDate
                    ? Math.floor(new Date(item?.endDate).getTime() / 1000)
                    : null,
                  exclusion: !!commandInExclude, // True if the command is in the exclude array
                  isEnvRestricted:
                    agentEnvString &&
                      Array.isArray(command.environment) &&
                      !command.environment.includes(agentEnvString)
                      ? false
                      : true,
                  isCRRequired: matchingGroup.needsChangeRequest === "true",
                  CTask: null,
                  CRNumber: null,
                  ReqNumber: item?.ReqNumber || null,
                  sudoers: command?.sudoers ?? [],
                  directory: command?.directory ?? [],
                  isSubDir: !!command?.isSubDirectoryAllowed

                };
                if (matchingTask && matchingTask?.CRNumber) {
                  restrictedCommand.CRNumber = matchingTask?.CRNumber
                }
                if (matchingTask && matchingTask?.CTask) {
                  restrictedCommand.CTask = matchingTask?.CTask
                }
                if (commandMatchingTask && commandMatchingTask?.CRNumber) {
                  restrictedCommand.CRNumber = commandMatchingTask?.CRNumber
                }
                if (commandMatchingTask && commandMatchingTask?.CTask) {
                  restrictedCommand.CTask = commandMatchingTask?.CTask
                }
                if (matchingTask && matchingTask?.validUpto) {
                  restrictedCommand.validUpto = matchingTask?.validUpto
                }
                if (commandMatchingTask && commandMatchingTask?.validUpto) {
                  restrictedCommand.validUpto = commandMatchingTask?.validUpto
                }
                if (!restrictedCommand?.CRNumber && restrictedCommand?.isCRRequired && irisData?.errors) {
                  restrictedCommand.CRNumber = 'XXXX';
                }
                userApprovedRestrictedCommands.push(restrictedCommand);
              }
            });
          }

        });
      }
      allGroupConfigData.forEach((group) => {
        let matchingTask =
          Array.isArray(irisFilteredData) &&
          irisFilteredData.find(
            (task) => task.description === group.name
          );
        group.commands.forEach((command) => {
          let commandMatchingTask
          if (Array.isArray(irisFilteredData) && irisFilteredData?.length && !matchingTask) {
            commandMatchingTask = irisFilteredData.find(
              (task) => task.description === command.command
            );
          }
          const defaultCommand = {
            command: command.command,
            recordEnabled:command.recordEnabled,
            allowedSubUsers: command.allowedSubUsers || [],
            allowedGroup: command.allowedSubUserGroup || [],
            runWithSudo: !!command.runAsRoot,
            isAllowed: !isUserBlocked && (matchingTask?.CRNumber || commandMatchingTask?.CRNumber) ? true : false, // Default to false since these are not from restrictedData
            validUpto: Math.floor(Date.now() / 1000) - 86400, 
            exclusion: false,
            isEnvRestricted:
              agentEnvString &&
                Array.isArray(command.environment) &&
                !command.environment.includes(agentEnvString)
                ? false
                : true,
            isCRRequired: group.needsChangeRequest === "true",
            CTask: null,
            CRNumber: null,
            ReqNumber: null,
            sudoers: command?.sudoers ?? [],
            directory: command?.directory ?? [],
            isSubDir: !!command?.isSubDirectoryAllowed

          };
          if (matchingTask && matchingTask?.CRNumber) {
            defaultCommand.CRNumber = matchingTask?.CRNumber
          }
          if (commandMatchingTask && commandMatchingTask?.CRNumber) {
            defaultCommand.CRNumber = commandMatchingTask?.CRNumber
          }
          if (matchingTask && matchingTask?.CTask) {
            defaultCommand.CTask = matchingTask?.CTask
          }
          if (commandMatchingTask && commandMatchingTask?.CTask) {
            defaultCommand.CTask = commandMatchingTask?.CTask
          }
          if (matchingTask && matchingTask?.validUpto) {
            defaultCommand.validUpto = matchingTask?.validUpto
          }
          if (commandMatchingTask && commandMatchingTask?.validUpto) {
            defaultCommand.validUpto = commandMatchingTask?.validUpto
          }
          if (!defaultCommand?.CRNumber && defaultCommand?.isCRRequired && irisData?.errors) {
            defaultCommand.CRNumber = 'XXXX';
          }
          defaultRestrictedCommands.push(defaultCommand);
        });
        if (group?.exclude && group?.exclude?.length) {
          group.exclude.forEach((command) => {
            let commandMatchingTask
            if (Array.isArray(irisFilteredData) && irisFilteredData?.length && !matchingTask) {
              commandMatchingTask = irisFilteredData.find(
                (task) => task.description === command.command
              );
            }
            const defaultCommand = {
              command: command.command,
              recordEnabled:command.recordEnabled,
              allowedSubUsers: command.allowedSubUsers || [],
              allowedGroup: command.allowedSubUserGroup || [],
              runWithSudo: !!command.runAsRoot,
              isAllowed: !isUserBlocked && (matchingTask?.CRNumber || commandMatchingTask?.CRNumber) ? true : false, // Default to false since these are not from restrictedData
              validUpto: Math.floor(Date.now() / 1000) - 86400, 
              exclusion: true,
              isEnvRestricted:
                agentEnvString &&
                  Array.isArray(command.environment) &&
                  !command.environment.includes(agentEnvString)
                  ? false
                  : true,
              isCRRequired: group.needsChangeRequest === "true",
              CTask: null,
              CRNumber: null,
              ReqNumber: null,
              sudoers: command?.sudoers ?? [],
              directory: command?.directory ?? [],
              isSubDir: !!command?.isSubDirectoryAllowed

            };
            if (matchingTask && matchingTask?.CRNumber) {
              defaultCommand.CRNumber = matchingTask?.CRNumber
            }
            if (commandMatchingTask && commandMatchingTask?.CRNumber) {
              defaultCommand.CRNumber = commandMatchingTask?.CRNumber
            }
            if (matchingTask && matchingTask?.CTask) {
              defaultCommand.CTask = matchingTask?.CTask
            }
            if (commandMatchingTask && commandMatchingTask?.CTask) {
              defaultCommand.CTask = commandMatchingTask?.CTask
            }
            if (matchingTask && matchingTask?.validUpto) {
              defaultCommand.validUpto = matchingTask?.validUpto
            }
            if (commandMatchingTask && commandMatchingTask?.validUpto) {
              defaultCommand.validUpto = commandMatchingTask?.validUpto
            }
            if (!defaultCommand?.CRNumber && defaultCommand?.isCRRequired && irisData?.errors) {
              defaultCommand.CRNumber = 'XXXX';
            }
            defaultRestrictedCommands.push(defaultCommand);
          });
        }
      });

      // Step 3: Convert the map to an array for the final result
      restrictedCommands = [
        ...(Array.isArray(userApprovedRestrictedCommands) ? userApprovedRestrictedCommands : []),
        ...defaultRestrictedCommands.filter((defaultCmd) => {
          return !userApprovedRestrictedCommands.some(
            (userCmd) =>
              userCmd.command === defaultCmd.command && userCmd.exclusion === defaultCmd.exclusion
          );
        }),
      ];

      res.status(responseCodes.SUCCESS).json({
        flag: "success",
        data: {
          ...serverInfo,
          isUserBlocked,
          blacklistedCommands,
          allowedSubUserList,
          allowedGroup,
          restrictedCommands,
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



const appConfigDataRaw = async (req, res) =>
  connectDatabase(async (collections) => {
    try {

      const config = await collections.config_settings.findOne({});

      const resObj = {
        access_config_provider_url: config?.access_config_provider_url ? (config?.access_config_provider_url) : "",
        access_config_provider_username: config?.access_config_provider_username ? (config?.access_config_provider_username) : "",
        access_config_provider_password: config?.access_config_provider_password ? (config?.access_config_provider_password) : "",
        opensearch_url: config?.opensearch_url ? (config?.opensearch_url) : "",
        opensearch_username: config?.opensearch_username ? (config?.opensearch_username) : "",
        opensearch_password: config?.opensearch_password ? (config?.opensearch_password) : "",
        log_message_encryption: config?.log_message_encryption ? (config?.log_message_encryption) : false,
        log_message_encryption_key: config?.log_message_encryption_key ? (config?.log_message_encryption_key) : "",
        isCLIEnabled: config?.isCLIEnabled ? (config?.isCLIEnabled) : false,
        opensearch_index: config?.opensearch_index ? (config?.opensearch_index) : "",
        error_index: config?.error_index ? (config?.error_index) : "",
        application_index: config?.application_index ? (config?.application_index) : "",
        opensearch_command_record_index: config?.opensearch_command_record_index ? (config?.opensearch_command_record_index) : "",
        cybersphere_bin_hash: config?.cybersphere_bin_hash ? (config?.cybersphere_bin_hash) : "",
        enforce_etc_profile_script: config?.enforce_etc_profile_script ? (config?.enforce_etc_profile_script) : false,
        cybersphere_profile_script_hash: config?.cybersphere_profile_script_hash ? (config?.cybersphere_profile_script_hash) : "",


      }

      res.status(responseCodes.SUCCESS).json(resObj);
    } catch (error) {
      console.log(error, "errorOccurred");
      res.status(responseCodes.SERVER_ERROR).json({
        flag: "error",
        error: error.message,
        message: APIMessages.SERVER_ERROR,
      });
    }
  });



const traceLogs = async (req, res) => {
  connectDatabase(async (collections) => {
    try {

      const reqbody = req.method === "GET" ? req.query : req.body;
      let resArray = []

      const logsArray = Array.isArray(reqbody) ? reqbody : [reqbody];

      const configReqBodyValidation = Joi.object({
        uniqueTraceId: Joi.string().required(),
        hostname: Joi.string().required(),
        ci: Joi.string().required(),
        env: Joi.string().required(),
        platform: Joi.string().required(),
        region: Joi.string().required(),
        level: Joi.string().required(),
        sid: Joi.string().required(),
        timestamp: Joi.date().required(),
        message: Joi.string().required(),
      });
      let filter = [];

      for (let log of logsArray) {
        const { uniqueTraceId, hostname, ci, env, platform, region, level, sid, timestamp, message } = log;

        const validationBody = { uniqueTraceId, hostname, ci, env, platform, region, level, sid, timestamp, message };
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
        const epochTimestamp = Math.floor(Date.parse(timestamp) / 1000);

        const userObj = {
          uniqueTraceId: await encrypt(uniqueTraceId),
          hostname: await encrypt(hostname),
          ci: await encrypt(ci),
          level: await encrypt(level),
          timestamp: await encrypt(epochTimestamp),
          message: await encrypt(message),
          env: await encrypt(env),
          platform: await encrypt(platform),
          region: await encrypt(region),
          sid: await encrypt(sid)
        };

        filter.push(userObj.uniqueTraceId)

        resArray.push(userObj)

      }
      await collections.trace_logs.insert(resArray);

      return res.status(responseCodes.SUCCESS).json({
        success: true,
        statusCode: responseCodes.SUCCESS,
        message: "Logs added successfully",
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




const addCybersphereVersions = async (req, res) => {
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;
      const { version, envs, platforms, hashvalue, date } = reqbody;

      const versionObj = {
        version: await encrypt(version),
        envs: await encrypt(envs),
        platforms: await encrypt(platforms),
        hashvalue: await encrypt(hashvalue),
        date: date ? new Date(date) : new Date(),
      };

      await collections.cyb_binary_version.insertOne(versionObj);

      return res.status(responseCodes.SUCCESS).json({
        success: true,
        statusCode: responseCodes.SUCCESS,
        message: "Added CyberSphere Versions",
      });
    } catch (error) {
      res.status(responseCodes.SERVER_ERROR).json({
        flag: "error",
        error: error.message,
        message: APIMessages.SERVER_ERROR,
      });
    }
  })
};
const traceConfig = async (req, res) => {
  connectDatabase(async (collections) => {
    try {
      const { hostname, uniqueTraceId, username, sessionId } =
        req.method === "GET" ? req.query : req.body;

      const validation = Joi.object({
        hostname: Joi.string().required(),
        username: Joi.string().required(),
        uniqueTraceId: Joi.string().required(),
        sessionId: Joi.string().required(),
      }).validate({ hostname, username, uniqueTraceId, sessionId });

      if (validation.error) {
        return res.status(responseCodes.SUCCESS).json({
          flag: "error",
          error: validation.error.message.replace(
            /"([^"]+)"/g,
            (_, p1) => p1.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^\w/, (c) => c.toUpperCase())
          ),
        });
      }

      const [encHost, encUser, encTraceId, encSessionId] = await Promise.all([
        encrypt(hostname.trim()), encrypt(username.toLowerCase().trim()),
        encrypt(uniqueTraceId.trim()), encrypt(sessionId.trim())
      ]);

      let configDetails = await collections.trace_configs.findOne({
        hostname: encHost,
        username: encUser,
        uniqueTraceId: null,
        sessionId: null
      });
      const resultSet = configDetails ? {
        username: await decrypt(configDetails.username || ""),
        hostname: await decrypt(configDetails.hostname || ""),
        maxTime: parseInt(await decrypt(configDetails.maxTime || "0")),
        traceEnabled: 1,
        date: configDetails.date || "",
        ...((await collections.cybersphere_servers.findOne({ hostname }, { projection: { cmdb: 1 } }))?.cmdb || {}),
      } : { maxTime: 0, traceEnabled: 0 };

      const currentDateTime = new Date();
      const maxTimeInSeconds = resultSet.maxTime;
      const expectedEndTime = new Date(currentDateTime.getTime() + maxTimeInSeconds * 1000).toISOString();

      if (configDetails) {
        await collections.trace_configs.updateOne(
          { _id: ObjectId(configDetails._id) },
          { $set: { uniqueTraceId: encTraceId, sessionId: encSessionId, startDateTime: await encrypt(currentDateTime.toISOString()), expectedEndDateTime: await encrypt(expectedEndTime) } }
        );
      }

      res.status(responseCodes.SUCCESS).json({
        flag: "success",
        message: APIMessages.SUCCESS,
        data: resultSet,
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


module.exports = {
  getCybersphereBinary: (req, res) => getCybersphereBinary(req, res),
  checkServerAccess: (req, res) => checkServerAccess(req, res),
  executeCommand: (req, res) => executeCommand(req, res),
  permissionCheck: (req, res) => verifyUserPermissions(req, res),
  verifyAndExecute: (req, res) => verifyAndExecute(req, res),
  commandPermissions: (req, res) => commandPermissions(req, res),
  appConfigDataRaw: (req, res) => appConfigDataRaw(req, res),

  traceLogs: (req, res) => traceLogs(req, res),
  traceConfig: (req, res) => traceConfig(req, res),
  addCybersphereVersions: (req, res) => addCybersphereVersions(req, res),
  getCybersphereProfileScript: (req, res) => getCybersphereProfileScript(req, res),

};
