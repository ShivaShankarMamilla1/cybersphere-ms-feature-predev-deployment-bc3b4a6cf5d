const express = require("express");
const path = require("path");
const logger = require("morgan");
const cors = require("cors");
const bodyParser = require("body-parser");
const app = express();
require('./utils/jobs');
const routes = {
  agents: require("./routes/agentRoutes"),
  logs: require("./routes/logRoutes"),
  notifications: require("./routes/notificationRoutes"),
  settings: require("./routes/settingsRoutes"),
  cli: require("./routes/cliRoutes"),
  manageAccess: require("./routes/manageAccessRoutes"),
  approvalControl: require("./routes/approvalRoutes"),
  rustagent: require("./routes/agentAPIRoutes"),
  monitoring: require("./routes/monitoringRoutes"),
  bulkUpdate: require("./routes/bulkUpdateRoutes"),
  auth: require("./routes/authRoutes")
};

const middlewares = {
  validateOauthToken: require("./middlewares/oauthMiddleware").validateOauthToken,
  validatewithBasicAuth: require("./middlewares/agentMiddleware").validatewithBasicAuth
};

app.use(cors("*"));
app.use(logger("dev"));
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));
app.use(bodyParser.json({ limit: "50mb" }));

app.set("view engine", "pug");

app.use("/agents", middlewares.validateOauthToken, routes.agents);
app.use("/manageAccess", middlewares.validateOauthToken, routes.manageAccess);
app.use("/rustagent", middlewares.validatewithBasicAuth, routes.rustagent);
app.use("/logs", middlewares.validateOauthToken, routes.logs);
app.use("/notification", middlewares.validateOauthToken, routes.notifications);
app.use("/settings", middlewares.validateOauthToken, routes.settings);
app.use("/approval-control", middlewares.validateOauthToken, routes.approvalControl);
app.use("/cli", middlewares.validatewithBasicAuth, routes.cli);
app.use("/auth", middlewares.validateOauthToken, routes.auth);
app.use("/monitoring", middlewares.validateOauthToken, routes.monitoring);
app.use("/bulkupdate", routes.bulkUpdate);

app.get("/env", (req, res) => res.send({ ENV: process.env }));

if (process.env.NODE_ENV === "local") {
  app.listen(process.env.port, (err) => {
    if (err) {
      console.log("Error in server setup");
    } else {
      console.log("Server listening on Port", process.env.port);
    }
  });
}

module.exports = app;
