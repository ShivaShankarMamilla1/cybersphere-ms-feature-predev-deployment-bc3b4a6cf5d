const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getAWSKey, getAWSSecreet } = require("../utils/envUtils");

const getFileFromS3 = async (fileName = "") => {

    try {
        const awsAccessKey = process.env.AWS_ACCESS_KEY_ID
            ? process.env.AWS_ACCESS_KEY_ID
            : await getAWSKey();
        const awsSecretKey = process.env.AWS_SECRET_ACCESS_KEY
            ? process.env.AWS_SECRET_ACCESS_KEY
            : await getAWSSecreet();
        const awsS3Client = new S3Client({
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: awsAccessKey,
                secretAccessKey: awsSecretKey,
            },
        });

        const getObjectParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: fileName,
        };

        const command = new GetObjectCommand(getObjectParams);

        const response = await awsS3Client.send(command);

        return response.Body;
    } catch (e) {
        console.log('Error downloading from S3 bucket', e)
        return null;
    }
}

module.exports = {
    getFileFromS3,
};