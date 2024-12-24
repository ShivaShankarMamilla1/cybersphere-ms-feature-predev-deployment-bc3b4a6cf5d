/**
 * Module dependencies.
 */
/**
 * Response Handler Function.
 */
/**
 * /**
 * This function gave response Data
 */
/**
 * Common function for handling api response in controllers.
 * @param {*} res
 * @param {*} error
 * @param {*} message
 * @param {*} data
 * @param {*} status
 * @param {*} customResponse
 */
const responseHandler = (
  res,
  error,
  message,
  data = null,
  status = "200",
  customResponse = {}
) => {
  if (!res || !message) {
    throw new Error("No arguments supplied");
  } else {
    if (error) {
      return res.status(status).json({
        status: false,
        statusCode: status,
        message,
        data,
        error,
        ...customResponse,
      });
    } else {
      /**
       * /**
       * Else Part
       */
      return res.status(status).json({
        status: true,
        statusCode: status,
        message,
        data,
        ...customResponse,
      });
    }
  }
};

/**
 * Exporting responseHandler function.
 */
module.exports = responseHandler;
