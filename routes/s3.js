
const express = require('express');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
require('dotenv').config();

const router = express.Router();

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'eu-west-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});

router.get('/presign', async (req, res) => {
  const { filename, type } = req.query;
  if (!filename || !type) {
    return res.status(400).json({ error: 'Missing filename or type' });
  }
  const bucketName = process.env.S3_BUCKET_NAME;
  if (!bucketName) {
    console.error("S3_BUCKET_NAME environment variable is not defined");
    return res.status(500).json({ error: 'Server configuration error: Bucket name missing' });
  }

  try {
    const key = `profile-photos/${filename}`; 

    const cmd = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: type,
    });

    const url = await getSignedUrl(s3, cmd, { expiresIn: 300 }); 

    console.log(`Generated presigned URL for ${key} with ContentType ${type}`);
    res.json({ url });

  } catch (err) {
    console.error('Error generating presigned URL:', err);
    if (err.name === 'CredentialsProviderError') {
         console.error("Check AWS credentials in .env file or environment variables.");
    } else if (err.name === 'NoSuchBucket') {
         console.error(`Bucket ${bucketName} not found or access denied.`);
    } else if (err.code === 'AccessDenied') {
         console.error(`Access Denied: Ensure IAM user/role has s3:PutObject permission for bucket ${bucketName}`);
    }
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

module.exports = router;