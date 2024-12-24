const express = require("express");
const ServerGroupController = require("../controllers/manageAccess/ServerGroup");
const CommandGroupController = require("../controllers/manageAccess/CommandGroup");
const BlackListedController = require("../controllers/manageAccess/BlackListedCommandGroup");
const ADGroupController = require("../controllers/manageAccess/ADGroup");
const directoryController = require("../controllers/manageAccess/directoryController");

const {
  adminMiddleware,
  adminOrSupportMiddleware,
  adminOrSupportOrConfigMiddleware,
} = require("../middlewares/userAccessMiddleware");
const ADGroup = require("../controllers/manageAccess/ADGroup");
const router = express.Router();

const routes = [
  // AD Group Routes
  { method: "post", path: "/handleadgroup", handler: "handleADGroup", middleware: adminMiddleware, controller: ADGroupController, },
  { method: "get", path: "/getUsersAccessList", handler: "getUsersAccessList", middleware: adminOrSupportOrConfigMiddleware, controller: ADGroupController, },
  { method: "get", path: "/deleteadgroup", handler: "deleteADGroup", middleware: adminMiddleware, controller: ADGroupController, },
  { method: "get", path: "/getadgrouplist", handler: "getADGroupList", controller: ADGroupController, },
  { method: "get", path: "/getadgroupdetails", handler: "getADGroupDetails", controller: ADGroupController, },
  { method: "get", path: "/getfiltervalue", handler: "getFilterValue", controller: ADGroupController, },
  { method: "post", path: "/getagentserverlist", handler: "getAgentServerList", controller: ADGroupController, },
  { method: "get", path: "/getadgroupiam", handler: "getAdGroupIAM", controller: ADGroupController, },
  { method: "get", path: "/getUsernamesList", handler: "getUsernamesList", controller: ADGroupController, },
  // BalckListedCommand Routes
  {
    method: "get",
    path: "/getblacklistedcommands",
    handler: "getBlacklistedCommands",
    middleware: adminOrSupportOrConfigMiddleware,
    controller: BlackListedController,
  },
  {
    method: "post",
    path: "/handleblacklistedcommands",
    handler: "handleBlacklistedCommands",
    middleware: adminOrSupportOrConfigMiddleware,
    controller: BlackListedController,
  },

  // Command Group Routes
  {
    method: "get",
    path: "/getcommandgrouplist",
    handler: "getCommandGroupList",
    controller: CommandGroupController,
  },
  {
    method: "get",
    path: "/getcommandgroupdetail",
    handler: "getCommandGroupDetail",
    controller: CommandGroupController,
  },
  {
    method: "post",
    path: "/handlecommandgroup",
    handler: "handleCommandGroup",
    middleware: adminOrSupportOrConfigMiddleware,
    controller: CommandGroupController,
  },
  {
    method: "get",
    path: "/deletecommandgroup",
    handler: "deleteCommandGroup",
    middleware: adminOrSupportMiddleware,
    controller: CommandGroupController,
  },
  {
    method: "get",
    path: "/getgroupconfig",
    handler: "getGroupConfig",
    middleware: adminOrSupportOrConfigMiddleware,
    controller: CommandGroupController,
  },
  {
    method: "get",
    path: "/getServiceAccountUsers",
    handler: "getServiceAccountUsers",
    middleware: adminOrSupportOrConfigMiddleware,
    controller: CommandGroupController,
  },
  {
    method: "get",
    path: "/getAllCommandsList",
    handler: "getAllCommandsList",
    controller: CommandGroupController,
  },
  {
    method: "post",
    path: "/handleserviceaccount",
    handler: "handleServiceAccount",
    middleware: adminOrSupportOrConfigMiddleware,
    controller: CommandGroupController,
  },
  {
    method: "post",
    path: "/handlesudoer",
    handler: "handleSudoer",
    middleware: adminOrSupportOrConfigMiddleware,
    controller: CommandGroupController,
  },
  // Server Group Routes
  {
    method: "get",
    path: "/getservergroup",
    handler: "getServerGroup",
    middleware: adminOrSupportOrConfigMiddleware,
    controller: ServerGroupController,
  },
    // Server Group Routes
    {
      method: "get",
      path: "/getCybersphereServers",
      handler: "getCybersphereServers",
      controller: ServerGroupController,
    },
  {
    method: "get",
    path: "/getservergroupList",
    handler: "getServerGroupList",
    controller: ServerGroupController,
  },
  {
    method: "get",
    path: "/getservergroupdetails",
    handler: "getServerGroupDetails",
    controller: ServerGroupController,
  },
  {
    method: "post",
    path: "/handservergroup",
    handler: "handleServerGroup",
    middleware: adminOrSupportOrConfigMiddleware,
    controller: ServerGroupController,
  },
  {
    method: "get",
    path: "/getSubUserGroup",
    handler: "getSubUserGroup",
    controller: CommandGroupController,
  },
  {
    method: "post",
    path: "/handleSubUserGroup",
    handler: "handleSubUserGroup",
    middleware: adminOrSupportOrConfigMiddleware,
    controller: CommandGroupController,
  },
  { method: "post", path: "/addADGroup", handler: "addADGroup", middleware: adminMiddleware, controller: ADGroupController, },
  { method: "get", path: "/deletegroup", handler: "deleteGroupById", middleware: adminMiddleware, controller: ADGroupController, },
  { method: "get", path: "/getIAMUsers", handler: "getIAMUsers", controller: ADGroupController, },
  { method: "get", path: "/getadgroupbyId", handler: "getAdGroupById", middleware: adminMiddleware, controller: ADGroupController, },
  {
    method: "get",
    path: "/deleteservergroup",
    handler: "deleteServerGroup",
    middleware: adminOrSupportOrConfigMiddleware,
    controller: ServerGroupController,
  },
  {
    method: "get",
    path: "/getExceptionList",
    handler: "getExceptionList",
    middleware: adminOrSupportOrConfigMiddleware,
    controller: ServerGroupController
  },
  {
    method: "post",
    path: "/handleException",
    handler: "handleExceptionList",
    middleware: adminOrSupportOrConfigMiddleware,
    controller: ServerGroupController,
  },
  {
    method: "get",
    path: "/deleteexception",
    handler: "deleteException",
    middleware: adminOrSupportOrConfigMiddleware,
    controller: ServerGroupController,
  },

  // directory group routes
  {
    method: "post",
    path: "/handledirectorygroup",
    handler: "handleDirectoryGroup",
    middleware: adminOrSupportOrConfigMiddleware,
    controller: directoryController,
  },
  {
    method: "post",
    path: "/createnewdirectory",
    handler: "createNewDirectory",
    middleware: adminOrSupportOrConfigMiddleware,
    controller: directoryController,
  },
  {
    method: "get",
    path: "/getdirectorygroup",
    handler: "getDirectoryGroup",
    middleware: adminOrSupportOrConfigMiddleware,
    controller: directoryController,
  },
  {
    method: "get",
    path: "/getdirectorygrouplist",
    handler: "getDirectoryGroupList",
    middleware: adminOrSupportOrConfigMiddleware,
    controller: directoryController,
  },
  {
    method: "post",
    path: "/deletedirectorygroup",
    handler: "deleteDirectoryGroup",
    middleware: adminOrSupportOrConfigMiddleware,
    controller: directoryController,
  },

];

// Apply routes to the router
routes.forEach((route) => {
  const { method, path, handler, middleware, controller } = route;
  if (middleware) {
    router[method](path, middleware, controller[handler]);
  } else {
    router[method](path, controller[handler]);
  }
});

module.exports = router;
