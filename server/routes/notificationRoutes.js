const express = require("express");
const notificationController = require("../controllers/notificationController");
const router = express.Router();


const routes = [
  { method: "post", path: "/handleCreateNotification", handler: "handleCreateNotification" },
  { method: "get", path: "/getNotifications", handler: "getNotifications" },
  { method: "get", path: "/notificationsMarkRead", handler: "notificationsMarkRead" },

];

routes.forEach((route) => {
  const { method, path, handler } = route;
  router[method](path, notificationController[handler]);
});

module.exports = router;
