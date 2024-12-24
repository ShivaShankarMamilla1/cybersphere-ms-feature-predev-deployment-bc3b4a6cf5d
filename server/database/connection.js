const { MongoClient } = require("mongodb");
require("dotenv").config();
const { getMongoConnectionURL, getMongoPem } = require("../utils/envUtils");
const fs = require("fs");
const path = require("path");
const { APP_CONFIG } = require("../../config");

let client;
let collections = {};
let discollections = {};

let collectionMappings = {
  "agents": "b5g7shloR2a9u1cs4sh3a4age",
  "appConfig": "b5g7vdfbR2a9u1cs4sh3a4acf",
  "adgroups": "b5g7gwdkR2a9u1cs4sh3a4adg",
  "approval_control_config": "b5g7psnlR2a9u1cs4sh3a4acc",
  "audit_logs": "b5g7srbpR2a9u1cs4sh3a4adl",
  "blacklistedCommands": "b5g7tqolR2a9u1cs4sh3a4blc",
  "cli_audit_logs": "b5g7aqtwR2a9u1cs4sh3a4cal",
  "config_settings": "b5g7zjkvR2a9u1cs4sh3a4cfg",
  "email_templates": "b5g7kpfgR2a9u1cs4sh3a4emt",
  "groupconfig": "b5g7nuvzR2a9u1cs4sh3a4grc",
  "iamusers": "b5g7edkcR2a9u1cs4sh3a4iam",
  "login_logs": "b5g7hnlfR2a9u1cs4sh3a4lgn",
  "notifcation": "b5g7tuveR2a9u1cs4sh3a4ntf",
  "requestaccess": "b5g7mkowR2a9u1cs4sh3a4req",
  "server_exception_list": "b5g7mkvqR2a9u1cs4sh3a4sel",
  "server_group": "b5g7wscuR2a9u1cs4sh3a4srg",
  "service_account_users": "b5g7hgfaR2a9u1cs4sh3a4sac",
  "trace_configs": "b5g7vjctR2a9u1cs4sh3a4trc",
  "trace_logs": "b5g7wglqR2a9u1cs4sh3a4trl",
  "users": "b5g7pjlmR2a9u1cs4sh3a4usr",
  "cyb_binary_version": "b5g7wglqR2a9u1cs4sh3a4ver",
  "directory_groups": "b5g7yvhtR2a9u1cs4sh3a4dgrp",
  "cybersphere_servers": "b5g7wglqR2a9u1cs4sh3a4ser",
  "cybersphere_performance_metrics": "b5g7wglqR2a9u1cs4sh3a4met",
};
let discoverycollectionMappings = {
  "sapMasterData": "sap_masterdatas",
}

const getTlsOptions = async () => {
  const tlsOptions = { ...APP_CONFIG.MONGO.OPTIONS, tls: true };
  const filePath = path.join(__dirname, "../../", process.env.MONGO_KEY || "mongo-dev-ca.pem");

  if (fs.existsSync(filePath)) {
    tlsOptions.tlsCAFile = filePath;
  } else {
    const pemData = await getMongoPem();
    fs.writeFileSync(filePath, pemData);
    tlsOptions.tlsCAFile = filePath;
  }

  return tlsOptions;
};

const connectToDatabase = async () => {
  if (client?.isConnected()) return { ...collections, ...discollections };

  const tlsOptions = await getTlsOptions();

  try {
    const mongoConnectionUrl = process.env.DB_CONNECTION_URL || await getMongoConnectionURL();
    const mongoConnectionString = `mongodb://${mongoConnectionUrl}?authSource=admin`;
    client = new MongoClient(mongoConnectionString, tlsOptions);
    const dbName = process.env.DATABASE ?? "b5g7cybR2a9u1sh3a4n6x0p8w0cs-dev";
    const discoveryDB = process.env.DISCOVERY_DATABASE ?? 'discovery';
    await client.connect();

    collections = Object.keys(collectionMappings).reduce((acc, key) => {
      acc[key] = client.db(dbName).collection(collectionMappings[key]);
      return acc;
    }, {});
    discollections = Object.keys(discoverycollectionMappings).reduce((acc, key) => {
      acc[key] = client.db(discoveryDB).collection(discoverycollectionMappings[key]);
      return acc;
    }, {});
    return { ...collections, ...discollections };
  } catch (error) {
    console.error("DB connection error:", error);
    if (client) {
      client.close();
    }
    return {};
  }
};

module.exports = { connectToDatabase, getTlsOptions };