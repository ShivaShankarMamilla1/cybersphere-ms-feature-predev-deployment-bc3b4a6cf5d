const express = require("express");
const cliController = require("../controllers/approvalController");
const router = express.Router();

const routes = [
    // cli Routes 
    { method: "get", path: "/getApprovalConfig", handler: "getApprovalConfig" },
    { method: "get", path: "/getIamUsersApproverConfig", handler: "getIamUsersApproverConfig" },
    { method: "post", path: "/handleApprovalConfig", handler: "handleApprovalConfig" },
];

routes.forEach((route) => {
    const { method, path, handler } = route;
    router[method](path, cliController[handler]);
});

module.exports = router;