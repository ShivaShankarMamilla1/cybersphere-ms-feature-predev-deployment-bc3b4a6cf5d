const cron = require('node-cron');
const serverLogController=require("../controllers/serverLogController")

const cronConfig = {
  every5min: '*/5 * * * *',   
  every7min: '*/7 * * * *',   
  every7day: '0 0 */7 * *',   
};

function syncServerFromOpenSearch () {
  console.log('syncServerFromOpenSearch Job started...');
  serverLogController.syncServerFromOpenSearch();
}
function syncCMDBData () {
  console.log('syncCMDBData Job started...');
  serverLogController.syncCMDBData();
}
function syncLogsFromOpenSearch () {
  console.log('syncLogsFromOpenSearch for report Job started...');
  serverLogController.fetchLogsAndInsert();
}

function startJob(cronExpression, jobFunction) {
  cron.schedule(cronExpression, jobFunction);
}

startJob(cronConfig.every5min, syncServerFromOpenSearch);       
startJob(cronConfig.every7min, syncCMDBData);     
startJob(cronConfig.every7day, syncLogsFromOpenSearch);

