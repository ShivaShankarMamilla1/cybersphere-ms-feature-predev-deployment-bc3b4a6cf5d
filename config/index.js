require("dotenv").config();

const APP_CONFIG = {
  PORT: process.env.PORT,
  MONGO: {
    URI: process.env.MONGO_CONN,
    OPTIONS: {
      useNewUrlParser: true,
      useUnifiedTopology: true
    },
    CONNECTION_URL: process.env.MONGO_CONNECTION_URL,
    DATABASE: process.env.DATABASE,
  },
  RUST_API_PASSWORD: "RUST_API_PASSWORD",
  MASTERAGENT_PASSWORD: "MASTER_AGENT_API_PASSWORD",
  SERVICE_ACCOUNT_PASSWORD: "RISE_SA_PASSWORD",
  ACTIVE_AGENTINFO_CRON: '*/5 * * * * ',
  FAILED_AGENTINFO_CRON: '0 0 * * *',
  ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN || 'http://localhost:3000',
};

module.exports = {
  APP_CONFIG,
};
