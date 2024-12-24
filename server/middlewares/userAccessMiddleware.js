const ROLES = require("../utils/roles");

const roleMiddleware = (allowedRoles) => {
    return (req, res, next) => {
        const userRoles = req.user?.roles ?? [];
        const rolesToCheck = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

        const hasRole = rolesToCheck.some(role => userRoles.includes(role));

        if (!hasRole) {
            return res.status(401).json({
                success: false,
                statusCode: 401,
                message: `Access denied. Required role(s): ${rolesToCheck.join(', ')}`,
            });
        }
        next();
    };
};

module.exports = {
    adminMiddleware: roleMiddleware(ROLES.admin),
    approverMiddleware: roleMiddleware(ROLES.approver),
    supportMiddleware: roleMiddleware(ROLES.support),
    adminOrApproverMiddleware: roleMiddleware([ROLES.admin, ROLES.approver]),
    adminOrSupportMiddleware: roleMiddleware([ROLES.admin, ROLES.support]),
    adminOrApproverOrConfigMiddleware: roleMiddleware([ROLES.admin, ROLES.approver, ROLES.configAdmin]),
    adminOrSupportOrConfigMiddleware: roleMiddleware([ROLES.admin, ROLES.support, ROLES.configAdmin]),
};
