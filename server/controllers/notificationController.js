/* eslint-disable no-unused-vars */
/* eslint-disable no-const-assign */
const responseCodes = require("../utils/responseCodes");
const Joi = require("joi");
const APIMessages = require("../utils/messages");
require("dotenv").config();

const db = require("../database/connection");
const { decrypt } = require("../utils/encryptFunctions");

const connectDatabase = async (callback) => {
  try {
    const collections = await db.connectToDatabase();
    return await callback(collections);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error occurred: ${error}`);
  }
};

const handleCreateNotification = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      const reqbody = req.method === "GET" ? req.query : req.body;
      const { message, type, username, command } = reqbody;
      const notificationRequestBody = Joi.object({
        message: Joi.string().required(),
        type: Joi.string().required(),
        username: Joi.string().required(),
      });

      const notificationObj = {
        message,
        type,
        username,
      };

      const validationResult =
        notificationRequestBody.validate(notificationObj);

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
      await collections.notifcation.insertOne({
        ...notificationObj,
        command: command ? command : "",
        readBy: [],
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

const getNotifications = async (req, res) => {
  connectDatabase(async (collections) => {
    try {
      // Get the username from the request body or query (depending on the request method)
      const reqbody = req.method === "GET" ? req.query : req.body;
      const { username } = reqbody; 

      // Fetch all notifications sorted by date
      const resultSet = await collections.notifcation
        .find()
        .sort({ date: -1 })
        .toArray();

      // Count unread notifications where the current user's name is not in the `readBy` array
      const unreadCount = await collections.notifcation.countDocuments({
        readBy: { $ne: username },
      });
      const userlist = await collections.notifcation.distinct("username");

      for (const ad of resultSet) {
        ad.message = await decrypt(ad.message);
        ad.type = await decrypt(ad.type)
        ad.username = await decrypt(ad.username)
        ad.command = await decrypt(ad.command)
      }

      res.status(responseCodes.SUCCESS).json({
        flag: "success",
        message: APIMessages.SUCCESS,
        data: {
          notifications: resultSet ?? [],
          unreadCount,
          userlist: await decrypt(userlist),
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
};

const notificationsMarkRead = async (req, res) =>
  connectDatabase(async (collections) => {
    try {
      // eslint-disable-next-line no-unused-vars
      const reqbody = req.method === "GET" ? req.query : req.body;
      const { username } = reqbody;
      // Find all notifications where `readBy` does not include the current username
       await collections.notifcation.updateMany(
        { readBy: { $ne: username } }, // Find notifications where `readBy` doesn't include the username
        {
          $addToSet: { readBy: username }, // Add the username to `readBy` array, only if it's not already there
        }
      );

      res.status(responseCodes.SUCCESS).json({
        flag: "success",
        message: APIMessages.SUCCESS,
        data: {},
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
  notificationsMarkRead: (req, res) => notificationsMarkRead(req, res),
  handleCreateNotification: (req, res) => handleCreateNotification(req, res),
  getNotifications: (req, res) => getNotifications(req, res),
};