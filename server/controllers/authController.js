const Joi = require("joi");
const db = require("../database/connection");
const responseCodes = require("../utils/responseCodes");
const APIMessages = require("../utils/messages");

const connectDatabase = async (callback) => {
    try {
        const collections = await db.connectToDatabase();
        return await callback(collections);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error occurred: ${error}`);
    }
};

const authAction = async (req, res) => connectDatabase(async (collections) => {
    try {
        const reqbody = req.method === "GET" ? req.query : req.body;
        const { action } = reqbody;
        const email = req?.user?.email ?? "";
        const name = req?.user?.name ?? "";
        const roles = req?.user?.roles ?? [];
        const username = req?.user?.username ?? "";

        const validateObj = {
            email,
            name,
            action,
            username
        };

        const schema = Joi.object({
            email: Joi.string().email().required(),
            name: Joi.string().trim().required(),
            username: Joi.string().trim().required(),
            action: Joi.string().valid("login", "logout").required(),
        });

        const validationResult = schema.validate(validateObj);

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
            })
        }

        const iamObj = {
            name,
            email: email.toLowerCase(),
            roles,
            loginType: "OAUTH",
            jnjMSUsername: username.toLowerCase()
        }
        if (action === "login") {
            iamObj["isLoggedIn"] = true;
            iamObj["loggedInAt"] = new Date();
        }
        if (action === "logout") {
            iamObj["isLoggedIn"] = false;
            iamObj["loggedOutAt"] = new Date();
        }

        iamObj["updatedAt"] = new Date();
        await collections.iamusers.findOneAndUpdate(
            { jnjMSUsername: new RegExp(`^${username}$`, "i") },
            { $set: iamObj },
            {
                upsert: true,
                returnDocument: "after",
            }
        );

        res.status(responseCodes.SUCCESS).json({
            flag: "success",
            message: APIMessages.SUCCESS,
            access: `${action} successful`,
        });

    } catch (error) {
        console.error(error);

        res.status(responseCodes.SERVER_ERROR).json({
            flag: "error",
            error: error.message,
            message: APIMessages.SERVER_ERROR,
        });
    }

});


module.exports = {
    authAction: (req, res) => authAction(req, res),
};