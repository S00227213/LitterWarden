// routes/s3.js
require('dotenv').config();           // load .env when running locally
const express = require('express');
const {
  S3Client,
  PutObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const router = express.Router();

/* ─────────────────────────  AWS CONFIG  ───────────────────────── */

const {
  AWS_REGION        = 'eu-west-1',
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  S3_BUCKET_NAME    = 'litterwarden',
} = process.env;

if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
  console.warn(
    '[routes/s3] AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY are missing – presign route will fail'
  );
}

const s3 = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId:     AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});

/* ─────────────────────────  ROUTE  ───────────────────────── */

router.get('/presign', async (req, res) => {
  const { filename, type, folder = 'reports' } = req.query;

  /* basic validation */
  if (!filename || !type) {
    return res.status(400).json({ error: 'Missing filename or type' });
  }
  if (!['reports', 'profile-photos'].includes(folder)) {
    return res.status(400).json({
      error: 'Invalid folder (must be "reports" or "profile-photos")',
    });
  }

  const key = `${folder}/${filename}`;

  try {
    const cmd = new PutObjectCommand({
      Bucket:      S3_BUCKET_NAME,
      Key:         key,
      ContentType: type,
    });

    // Presigned URL valid for 60 seconds
    const url = await getSignedUrl(s3, cmd, { expiresIn: 60 });

    console.log(`[routes/s3] Generated presign for ${key}`);
    return res.json({ url, key });
  } catch (err) {
    console.error('[routes/s3] Presign error:', err);
    return res
      .status(500)
      .json({ error: 'Failed to generate URL', details: err.message });
  }
});

module.exports = router;
