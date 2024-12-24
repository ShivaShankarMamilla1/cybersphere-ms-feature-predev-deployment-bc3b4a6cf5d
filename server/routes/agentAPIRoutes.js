const express = require("express");
const agentController = require("../controllers/agentController");
const router = express.Router();
const getAgentsHandler = "getAgents";

const routes = [
  { method: "get", path: "/", handler: getAgentsHandler },
  { method: "post", path: "/", handler: getAgentsHandler },
  { method: "post", path: "/info", handler: "getAgentsInfo" },
  { method: "get", path: "/getAgents", handler: getAgentsHandler },
  { method: "post", path: "/status", handler: "health" },
  { method: "post", path: "/download", handler: "download" },
  { method: "post", path: "/validate", handler: "validate" },
  { method: "post", path: "/versions", handler: "versions" },
  { method: "put", path: "/versions", handler: "versions" },
  { method: "delete", path: "/versions", handler: "deleteVersion" },
  { method: "post", path: "/permissionCheck", handler: "permissionCheck" },
  { method: "post", path: "/userAccess", handler: "versions" },
  { method: "put", path: "/userAccess", handler: "versions" },
  { method: "delete", path: "/userAccess", handler: "deleteVersion" },
  { method: "post", path: "/executecommand", handler: "executeCommand" },

];

routes.forEach((route) => {
  const { method, path, handler } = route;
  router[method](path, agentController[handler]);
});

module.exports = router;
