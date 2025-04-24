// routes/s3.js

const express = require('express');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
require('dotenv').config();

const router = express.Router();

// Set up the S3 client
const s3 = new S3Client({
  region: process.env.AWS_REGION || 'eu-west-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});

// Route to generate presigned S3 upload URL
router.get('/presign', async (req, res) => {
  const { filename, type } = req.query;

  if (!filename || !type) {
    return res.status(400).json({ error: "Missing filename or type in query parameters" });
  }

  if (!process.env.S3_BUCKET_NAME) {
    console.error("S3_BUCKET_NAME is not defined in environment variables.");
    return res.status(500).json({ error: "Server misconfigured: Bucket name missing" });
  }

  try {
    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: filename,
      ContentType: type,
    });

    const url = await getSignedUrl(s3, command, { expiresIn: 60 });
    res.json({ url });
  } catch (err) {
    console.error("Presign error:", err);
    res.status(500).json({ error: "Could not generate S3 upload URL" });
  }
});

module.exports = router;
