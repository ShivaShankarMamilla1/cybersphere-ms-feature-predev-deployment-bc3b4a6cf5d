const nodemailer = require("nodemailer");
const { decrypt } = require("./encryptFunctions");
const db = require("../database/connection");

const connectDatabase = async (callback) => {
  try {
    const collections = await db.connectToDatabase();
    return await callback(collections);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error occurred: ${error}`);
  }
};

const sendEmail = async ({ username, command, message, hostname, type }) => {
  try {
    // Connect to the database and fetch email configuration
    await connectDatabase(async (collections) => {
      const config = await collections.config_settings.findOne({});
      const template = await collections.email_templates.findOne({});

      config.appName = await decrypt(config.appName)
      config.subHeading = await decrypt(config.subHeading)
      config.auditLogSelect = await decrypt(config.auditLogSelect)
      config.company = await decrypt(config.company)

      template.subject = template?.subject
        ? await decrypt(template?.subject)
        : "";
      template.body = template?.body
        ? await decrypt(template?.body)
        : "";
      template.approvalSubject = template?.approvalSubject
        ? await decrypt(template?.approvalSubject)
        : "";

      template.approvalBody = template?.approvalBody
        ? await decrypt(template?.approvalBody)
        : "";
      template.enableNotification = template?.enableNotification
        ? await decrypt(template?.enableNotification)
        : "";
      template.enableApprovalNotification = template?.enableApprovalNotification
        ? await decrypt(template?.enableApprovalNotification)
        : "";
      template.notificationType = await Promise.all(template?.notificationType.map(async (noti) => await decrypt(noti)));


      if (!config || !config?.emailConfig) {
        throw new Error("Email configuration was not found!");
      }

      if (!template) {
        throw new Error("No Email Template was found!");
      }
      if (!template?.enableNotification) {
        return
      }
      if (!template?.notificationType?.includes(type)) {
        return
      }

      const emailContent = (template?.body ?? "")
        .replace("{{user}}", username)
        .replace("{{command}}", command)
        .replace("{{message}}", message)
        .replace("{{hostname}}", hostname)

      // Create the transporter for sending email using GoDaddy SMTP
      const transporter = nodemailer.createTransport({
        host: await decrypt(config?.emailConfig.smtpHost),
        port: await decrypt(config?.emailConfig.port), // Port for TLS
        secure: false,
        auth: {
          user: await decrypt(config?.emailConfig.from),
          pass: await decrypt(config?.emailConfig.password),
        },
        tls: {
          ciphers: "SSLv3",
          rejectUnauthorized: false, 
        },
        connectionTimeout: 20000, 
        socketTimeout: 20000, 
      });

      // Set up email options
      const mailOptions = {
        from: await decrypt(config?.emailConfig.from),
        to: await decrypt(template?.to),
        subject: template.subject,
        html: emailContent,
        cc: await decrypt(template?.cc) ?? "",
        bcc: await decrypt(template?.bcc) ?? "",
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.log("Error Sending Email", error);
        } else {
          console.log("Email sent successfully:", info.response);
        }
      });
    });
  } catch (error) {
    console.error("Email Send ERROR::::", error);
  }
};

const sendApprovalEmail = async ({ to, username, approver, requestedGroup }) => {
  try {
    // Connect to the database and fetch email configuration
    await connectDatabase(async (collections) => {
      const config = await collections.config_settings.findOne({});
      const template = await collections.email_templates.findOne({});

      if (!config || !config?.emailConfig) {
        throw new Error("Email configuration was not found!");
      }

      if (!template) {
        throw new Error("No Email Template was found!");
      }
      if (!template?.enableApprovalNotification) {
        return
      }

      const emailContent = (template?.approvalBody ?? "")
        .replaceAll("{{username}}", username)
        .replace("{{approver}}", approver)
        .replace("{{requestedGroup}}", requestedGroup)

      // Create the transporter for sending email using GoDaddy SMTP
      const transporter = nodemailer.createTransport({
        host: config?.emailConfig.smtpHost,
        port: config?.emailConfig.port, // Port for TLS
        secure: false,
        auth: {
          user: await decrypt(config?.emailConfig.from),
          pass: await decrypt(config?.emailConfig.password),
        },
        tls: {
          ciphers: "SSLv3",
          rejectUnauthorized: false, 
        },
        connectionTimeout: 20000, 
        socketTimeout: 20000, 
      });

      // Set up email options
      const mailOptions = {
        from: await decrypt(config?.emailConfig.from),
        to: await decrypt(to),
        subject: template.approvalSubject,
        html: emailContent,
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.log("Error Sending Email", error);
        } else {
          console.log("Email sent successfully:", info.response);
        }
      });
    });
  } catch (error) {
    console.error("Email Send ERROR::::", error);
  }
};

// Export the sendEmail function
module.exports = {
  sendEmail,
  sendApprovalEmail
};
