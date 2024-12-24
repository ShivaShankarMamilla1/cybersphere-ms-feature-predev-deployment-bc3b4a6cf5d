const express = require("express");
const logsController = require("../controllers/logsController");
const router = express.Router();

const {
  adminMiddleware,
} = require("../middlewares/userAccessMiddleware");


const routes = [
  // Audit logs Routes
  { method: "post", path: "/handleCreateLog", handler: "handleCreateLog" },
  { method: "get", path: "/getAuditLogs", middleware: adminMiddleware, handler: "getAuditLogs" },

];

routes.forEach((route) => {
  const { method, path, handler, middleware } = route;
  if (middleware) {
    router[method](path, middleware, logsController[handler]);
  } else {
    router[method](path, logsController[handler]);
  }

});

module.exports = router;
