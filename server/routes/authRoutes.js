const express = require("express");
const authController = require("../controllers/authController");
const router = express.Router();

const routes = [
    // auth Routes 
    { method: "post", path: "/authaction", handler: "authAction" },
];

routes.forEach((route) => {
    const { method, path, handler } = route;
    router[method](path, authController[handler]);
});

module.exports = router;
