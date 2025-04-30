const express = require('express');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const router = express.Router();

// ─── Use your live ENV vars ───────────────────────────────────────────────────
const s3 = new S3Client({
  region: process.env.AWS_REGION || 'eu-west-1',
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});
// ───────────────────────────────────────────────────────────────────────────────

router.get('/presign', async (req, res) => {
  const { filename, type, folder = 'reports' } = req.query;
  if (!filename || !type) {
    console.warn('Presign request missing filename or type:', req.query);
    return res.status(400).json({ error: 'Missing filename or type' });
  }

  const BUCKET = process.env.S3_BUCKET_NAME || 'litterwarden';
  if (!BUCKET) {
    console.error('S3_BUCKET_NAME is not defined');
    return res.status(500).json({ error: 'Bucket name missing' });
  }

  if (!['reports','profile-photos'].includes(folder)) {
    console.warn('Invalid folder in presign request:', folder);
    return res.status(400).json({ error: 'Invalid folder' });
  }

  const key = `${folder}/${filename}`;
  console.log(`➡️ Generating presign for Bucket=${BUCKET}, Key=${key}, ContentType=${type}`);

  try {
    const cmd = new PutObjectCommand({
      Bucket:      BUCKET,
      Key:         key,
      ContentType: type
    });

    const url = await getSignedUrl(s3, cmd, { expiresIn: 60 });
    console.log('✅ Presigned URL generated:', url);
    return res.json({ url, key });
  } catch (err) {
    console.error('🔥 Presign error:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
