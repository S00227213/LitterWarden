
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
  if (!process.env.S3_BUCKET_NAME) {
    console.error("S3_BUCKET_NAME is not defined");
    return res.status(500).json({ error: 'Bucket name missing' });
  }

  try {
    const cmd = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: `profile-photos/${filename}`,   
      ContentType: type,
      ACL: 'public-read'               
    });
    const url = await getSignedUrl(s3, cmd, { expiresIn: 60 });
    res.json({ url });
  } catch (err) {
    console.error('Presign error:', err);
    res.status(500).json({ error: 'Failed to generate URL' });
  }
});

module.exports = router;
