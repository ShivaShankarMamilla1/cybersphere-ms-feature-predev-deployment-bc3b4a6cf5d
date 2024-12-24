/**
 * Config for managing http api status codes.
 */
const responseCodes = {
  SUCCESS: 200,
  CREATED: 201,
  SERVER_ERROR: 500,
  ERROR: 400,
  EXISTS: 409,
  NOT_FOUND: 404,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  ALREADY_REPORTED: 208,
  UNPROCESSIBLE_ENTITY: 422,
  REDIRECT: 301,
};

/**
 * Exporting status codes config.
 */
module.exports = responseCodes;
