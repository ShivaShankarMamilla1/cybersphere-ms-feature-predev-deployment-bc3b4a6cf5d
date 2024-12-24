const express = require("express");
const multer = require("multer");
const logsController = require("../controllers/settingsController");

const router = express.Router();

const {
  adminMiddleware,
} = require("../middlewares/userAccessMiddleware");

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const routes = [
  { method: "post", path: "/handleUpdateConfig", middleware: adminMiddleware, handler: "handleUpdateConfig", upload: true, fileName: 'logo' },
  { method: "post", path: "/saveCLIConfig", middleware: adminMiddleware, handler: "saveCLIConfig" },
  { method: "post", path: "/handleemailconfig", middleware: adminMiddleware, handler: "handleEmailConfig" },
  { method: "post", path: "/handleemailtemplate", middleware: adminMiddleware, handler: "handleEmailTemplate" },
  { method: "post", path: "/handleApproverFlow", middleware: adminMiddleware, handler: "handleApproverFlow" },
  { method: "get", path: "/getConfig", handler: "getConfig" },
  { method: "get", path: "/getApproverFlows", handler: "getApproverFlows" },
  { method: "get", path: "/deleteApprovalFlowById", handler: "deleteApprovalFlowById" }
];

// Register routes
routes.forEach((route) => {
  const { method, path, handler, upload: isUpload, fileName, middleware } = route;

  // If the route requires file upload, use multer middleware
  if (isUpload || middleware) {
    router[method](path, middleware, upload.single(fileName), logsController[handler]);
  } else {
    router[method](path, logsController[handler]);
  }
});

module.exports = router;