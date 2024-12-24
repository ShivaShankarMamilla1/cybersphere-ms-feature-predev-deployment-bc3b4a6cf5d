const express = require("express");
const monitoringController = require("../controllers/monitoringController");
const router = express.Router();

const {
  adminMiddleware,
} = require("../middlewares/userAccessMiddleware");


const routes = [
  { method: "get", path: "/getMonitoringMetrics", handler: "getMonitoringMetrics" },
  { method: "get", path: "/getCliAuditLogs", handler: "getCliAuditLogs" },
  { method: "get", path: "/getUniqueValue", handler: "getUniqueValue" },
  { method: "get", path: "/getTraceLogs", middleware: adminMiddleware, handler: "getTraceLogs" },
  { method: "post", path: "/traceConfig", handler: "traceConfig" },
  { method: "post", path: "/addTraceConfig", handler: "addTraceConfig" },
];

routes.forEach((route) => {
  const { method, path, handler, middleware } = route;
  if (middleware) {
    router[method](path, middleware, monitoringController[handler]);
  } else {
    router[method](path, monitoringController[handler]);
  }

});

module.exports = router;
