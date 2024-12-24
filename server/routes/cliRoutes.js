const express = require("express");
const cliController = require("../controllers/cliController");
const router = express.Router();

const routes = [
    // cli Routes 
    { method: "get", path: "/cyberspherebinary", handler: "getCybersphereBinary" },
    { method: "get", path: "/checkserveraccess", handler: "checkServerAccess" },
    { method: "post", path: "/permissionCheck", handler: "permissionCheck" },
    { method: "post", path: "/executecommand", handler: "executeCommand" },
    { method: "post", path: "/verifyandexecute", handler: "verifyAndExecute" },
    { method: "get", path: "/commandPermissions", handler: "commandPermissions" },
    { method: "get", path: "/appConfigDataRaw", handler: "appConfigDataRaw" },
   
    { method: "post", path: "/addcybversion", handler: "addCybersphereVersions" },
    { method: "get", path: "/cybersphereprofilescript", handler: "getCybersphereProfileScript" },
    { method: "post", path: "/traceConfig", handler: "traceConfig" },
    { method: "post", path: "/traceLogs", handler: "traceLogs" },
];

routes.forEach((route) => {
    const { method, path, handler } = route;
    router[method](path, cliController[handler]);
});

module.exports = router;
