const axios = require('axios');
const { getServiceNowPassword } = require("../utils/envUtils");
/**
 * @param {string} endpoint 
 * @param {object} params 
 * @returns {Promise<object>}
 */
const makeApiRequest = async (endpoint, params) => {
  console.log(`Received query ${JSON.stringify(params)} for API: ${endpoint}`);
  
  const SERVICENOW_PASSWORD = process.env.IRIS_PASSWORD ? process.env.IRIS_PASSWORD : await getServiceNowPassword();
  const { SERVICENOW_BASE_URL, SERVICENOW_USERNAME } = process.env;

  if (!SERVICENOW_BASE_URL || !SERVICENOW_USERNAME || !SERVICENOW_PASSWORD) {
    throw new Error("Environment variables SERVICENOW_BASE_URL, SERVICENOW_USERNAME, or SERVICENOW_PASSWORD are missing.");
  }

  try {
    const response = await axios.get(`${SERVICENOW_BASE_URL}${endpoint}`, {
      params,
      auth: {
        username: SERVICENOW_USERNAME,
        password: SERVICENOW_PASSWORD,
      },
    });
    return response.data;
  } catch (error) {
    const status = error?.response?.status;
    console.log(`Received status ${status} for API: ${endpoint}`);

    if ([404].includes(status)) {
      return error.response.data;
    }
    console.error(`Error calling API: ${endpoint}`, error.message);
    throw new Error(`API call failed: ${endpoint}`);
  }
};

/**
 * @param {string} hostname 
 * @returns {Promise<object>} 
 */
const getChangeTasks = async (hostname, parentCi) => {
  if (!parentCi) {
    console.error(`ciName is required`);
    return { errors: false, message: "ciName is required." };
  }


  // --------Get Change Request for CI----------

  let changeRequestResponse;
  try {
    changeRequestResponse = await makeApiRequest("/api/now/v1/table/change_request", {
      sysparm_query: `cmdb_ci.name=${parentCi}^state=500`,
      sysparm_display_value: true,
      sysparm_exclude_reference_link: true,
      sysparm_fields: "number,cmdb_ci,state,start_date,end_date",
    });
    if (!changeRequestResponse?.result?.length) {
      console.error(`No Change Request found for the Parent CI in Implement state for parentCi : ${parentCi}`,changeRequestResponse);
      return { errors: false, message: "No Change Request found for the Parent CI in Implement state." };
    }
  } catch (err) {
    console.error(`Error fetching change request for parentCi : ${parentCi}`, err);
    return { errors: true, message: "Failed to fetch change request information." };
  }

  if (!changeRequestResponse?.result?.length) {
    return { errors: true, message: "No Change Request found for the Parent CI in Implement state." };
  }

  const changeRequest = changeRequestResponse.result[0];
  const { number: changeRequestNumber, start_date, end_date } = changeRequest;

  const now = new Date();
  if (!(new Date(start_date) <= now && now <= new Date(end_date))) {
    return { errors: true, message: "Change Request is not active based on schedule dates." };
  }
  console.log(`Change Request Number: ${changeRequestNumber} found for this CI: ${parentCi}`);
  // --------Get Change task for CR----------

  let changeTaskResponse;
  try {
    // Fetch Change Tasks
    changeTaskResponse = await makeApiRequest("/api/now/v1/table/change_task", {
      sysparm_query: `parent.number=${changeRequestNumber}^state=300^short_descriptionLIKECYBERSPHERE`,
      sysparm_display_value: true,
      sysparm_exclude_reference_link: true,
      sysparm_fields: "number,parent,description,assigned_to,state",
    });
  } catch (err) {
    console.error("Error fetching change tasks:", err);
    return { errors: true, message: "Failed to fetch change tasks." };
  }

  const tasks = changeTaskResponse?.result?.map((task) => ({
    taskNumber: task.number,
    description: task.description,
    assignedTo: task.assigned_to || "Unassigned",
  })) || [];
  console.log(`Change Task: ${JSON.stringify(tasks)} found for this CR: ${changeRequestNumber}`);

  return {
    errors: false,
    end_date,
    changeRequestNumber,
    tasks,
  };
};

module.exports = getChangeTasks;
