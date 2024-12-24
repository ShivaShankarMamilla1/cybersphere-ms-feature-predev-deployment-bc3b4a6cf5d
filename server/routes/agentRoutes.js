const express = require("express");
const agentController = require("../controllers/agentController");
const router = express.Router();

const {
  adminMiddleware,
  adminOrApproverOrConfigMiddleware
} = require("../middlewares/userAccessMiddleware");

// Commonly used handlers
const getAgentsHandler = "getAgents";
const bulkRestartAgentHandler = "bulkRestartAgent";
const restartHandler = "restart";

const routes = [
  { method: "get", path: "/", handler: getAgentsHandler },
  { method: "post", path: "/", handler: getAgentsHandler },
  { method: "post", path: "/info", handler: "getAgentsInfo" },
  { method: "get", path: "/pid", handler: "pid" },
  { method: "get", path: "/metrics", handler: "metric" },
  { method: "put", path: "/download", handler: "version" },
  { method: "get", path: "/config", handler: "config" },
  {
    method: "put",
    path: "/local-configuration",
    handler: "updateLocalConfiguration",
  },
  { method: "post", path: "/logs", handler: "getApplicationLogs" },
  { method: "get", path: "/versionlist", handler: "versionList" },

  { method: "get", path: "/regions", handler: "getRegions" },
  { method: "get", path: "/platforms", handler: "getPlatforms" },
  { method: "get", path: "/environments", handler: "getEnvironments" },
  { method: "get", path: "/sids", handler: "getSids" },
  { method: "get", path: "/os-types", handler: "getOStypes" },
  { method: "get", path: "/service-names", handler: "getServiceNames" },
  { method: "get", path: "/agent-versions", handler: "getAgentVersions" },

  //Agent API
  { method: "post", path: "/startagent", handler: "startAgent" },
  { method: "put", path: "/restart", handler: "restartAgent" },
  { method: "put", path: "/shutdown", handler: "shutdown" },
  { method: "post", path: "/health", handler: "health" },
  { method: "put", path: "/syncAgentStatus", handler: "syncAgentStatus" },
  { method: "put", path: "/syncCMDBData", handler: "syncCMDBData" },

  //Bulk Operation
  { method: "post", path: "/bulk/start", handler: "bulkStartAgent" },
  { method: "post", path: "/bulk/stop", handler: "bulkStopAgent" },
  { method: "post", path: "/bulk/restart", handler: bulkRestartAgentHandler },
  { method: "put", path: "/bulk/upgrade", handler: "bulkUpgradeAgent" },

  //Jobs API
  //Jobs
  { method: "post", path: "/jobs", handler: "jobs" },
  { method: "post", path: "/jobs/start", handler: "start" },
  { method: "post", path: "/jobs/stop", handler: "stopjob" },
  { method: "put", path: "/jobs/restart", handler: restartHandler },
  //Job
  { method: "post", path: "/job", handler: "getJobDetails" },
  { method: "post", path: "/postjob", handler: "postJob" },
  { method: "put", path: "/updatejob", handler: "updateJob" },
  { method: "delete", path: "/deletejob", handler: "deleteJob" },
  { method: "post", path: "/joblogs", handler: "getJobLogs" },

  //master agent
  { method: "get", path: "/masterdata", handler: "getMasterAgents" },
  { method: "post", path: "/masterdata", handler: "postMasterAgent" },
  { method: "delete", path: "/masterdata", handler: "deleteMasterAgent" },

  // Permission Routes
  { method: "get", path: "/deleteadgroup", middleware: adminMiddleware, handler: "deleteADGroup" },
  { method: "get", path: "/getadgrouplist", handler: "getADGroupList" },
  { method: "get", path: "/getadgroupdetails", handler: "getADGroupDetails" },
  { method: "post", path: "/requestaccess", handler: "createRequest" },
  { method: "get", path: "/getapprovallist", middleware: adminOrApproverOrConfigMiddleware, handler: "getApprovalList" },
  { method: "get", path: "/getrequestlist", handler: "getRequestList" },
  {
    method: "post",
    path: "/canceluserrequest",
    handler: "cancelUserRequest",
  },
  {
    method: "post",
    path: "/handlerequestapproval",
    middleware: adminOrApproverOrConfigMiddleware,
    handler: "handleRequestApproval",
  },
  {
    method: "post",
    path: "/encryptCollection",
    handler: "encryptAllRequestAccess",
  },

  {
    method: "get",
    path: "/getcommandgroupdetail",
    handler: "getCommandGroupDetail",
  },
  { method: "post", path: "/permissionCheck", handler: "permissionCheck" },
  { method: "post", path: "/executecommand", handler: "executeCommand" },


  { method: "get", path: "/deletecommandgroup", middleware: adminMiddleware, handler: "deleteCommandGroup" },
  { method: "get", path: "/checkserveraccess", handler: "checkServerAccess" },
  // Server Group

  {
    method: "get",
    path: "/getservergroupdetails",
    handler: "getServerGroupDetails",
  },
  { method: "get", path: "/deleteservergroup", middleware: adminMiddleware, handler: "deleteServerGroup" },
  // Notification Routes
  {
    method: "post",
    path: "/handleCreateNotification",
    handler: "handleCreateNotification",
  },
  { method: "get", path: "/getNotifications", handler: "getNotifications" },
  {
    method: "get",
    path: "/notificationsMarkRead",
    handler: "notificationsMarkRead",
  },
  // Audit logs Routes
  { method: "post", path: "/handleCreateLog", handler: "handleCreateLog" },
  { method: "get", path: "/getAuditLogs", handler: "getAuditLogs" },
  { method: "get", path: "/getserverlist", handler: "getServerListForUser" },
];

routes.forEach((route) => {
  const { method, path, handler, middleware } = route;
  if (middleware) {
    router[method](path, middleware, agentController[handler]);
  } else {
    router[method](path, agentController[handler]);
  }
});

module.exports = router;
