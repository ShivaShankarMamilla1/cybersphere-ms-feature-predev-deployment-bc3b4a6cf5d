const express = require("express");
const bulkUpdateController = require("../controllers/bulkUpdateController");
const router = express.Router();

const routes = [
    // bulk update Routes 
    { method: "get", path: "/bulkppdateforadgroup", handler: "bulkUpdateForADGroup" },
    { method: "get", path: "/bulkupdateforcommandgroup", handler: "bulkUpdateForCommandGroup" },
    { method: "get", path: "/bulkupdateforservergroup", handler: "bulkUpdateForServerGroup" },
    { method: "get", path: "/bulkupdateforcli", handler: "bulkUpdateForCLI" },
    { method: "get", path: "/bulkUpdateblacklisted", handler: "bulkUpdateBlacklisted" },
    { method: "get", path: "/bulkUpdateforrequests", handler: "bulkUpdateForRequests" },
    { method: "get", path: "/bulkUpdateServiceAccountUsers", handler: "bulkUpdateServiceAccountUsers" },

];

routes.forEach((route) => {
    const { method, path, handler } = route;
    router[method](path, bulkUpdateController[handler]);
});

module.exports = router;
