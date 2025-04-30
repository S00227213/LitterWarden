// server.js ─ LitterWarden backend (full file, UK spelling)

require('dotenv').config();
const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const fetch    = require('node-fetch');
const { URL }  = require('url');
const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const s3Routes = require('./routes/s3');

const app = express();
app.use(express.json());
app.use(cors({ origin: '*' }));
app.use('/s3', s3Routes);

// ─── ENV ────────────────────────────────────────────────────────────────────
const {
  MONGO_URI,
  GOOGLE_MAPS_API_KEY,
  AZURE_CV_KEY,
  AZURE_CV_ENDPOINT,
  S3_BUCKET_NAME,
  AWS_REGION,
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  PORT = 10000
} = process.env;

// ─── Startup sanity-checks & logging ────────────────────────────────────────
console.log('▶️ AWS_REGION:', AWS_REGION || 'undefined');
console.log('▶️ S3_BUCKET_NAME:', S3_BUCKET_NAME || 'undefined');
console.log('▶️ AWS_ACCESS_KEY_ID (prefix):', AWS_ACCESS_KEY_ID ? AWS_ACCESS_KEY_ID.slice(0,6) : 'undefined');
console.log('▶️ Server time:', new Date().toISOString());

if (!MONGO_URI) {
  console.error('FATAL ERROR: MONGO_URI environment variable is not set.');
  process.exit(1);
}
if (!GOOGLE_MAPS_API_KEY)  console.warn('Warning: GOOGLE_MAPS_API_KEY is not set. Geocoding may fail.');
if (!AZURE_CV_KEY || !AZURE_CV_ENDPOINT)
  console.warn('Warning: AZURE_CV creds not set. Image analysis disabled.');
if (!S3_BUCKET_NAME)      console.warn('Warning: S3_BUCKET_NAME not set.');
if (!AWS_REGION)          console.warn('Warning: AWS_REGION not set.');
if (!AWS_ACCESS_KEY_ID)   console.warn('Warning: AWS_ACCESS_KEY_ID not set.');
if (!AWS_SECRET_ACCESS_KEY) console.warn('Warning: AWS_SECRET_ACCESS_KEY not set.');

// ─── S3 client ──────────────────────────────────────────────────────────────
let s3Client = null;
if (AWS_REGION && AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY && S3_BUCKET_NAME) {
  try {
    s3Client = new S3Client({
      region: AWS_REGION,
      credentials: {
        accessKeyId:     AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY
      }
    });
    console.log(`✅ S3 client configured for region ${AWS_REGION}`);
  } catch (err) {
    console.error('Error configuring S3 client:', err);
  }
} else {
  console.warn('S3 client NOT configured (missing env vars).');
}

// ─── MongoDB ────────────────────────────────────────────────────────────────
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB connected successfully'))
  .catch(err => {
    console.error('MongoDB connection error:', err.message || err);
    process.exit(1);
  });

// ─── Schema & Model ─────────────────────────────────────────────────────────
const reportSchema = new mongoose.Schema({
  latitude:           { type: Number, required: true, index: true },
  longitude:          { type: Number, required: true, index: true },
  town:               { type: String, default: 'Unknown', trim: true },
  county:             { type: String, default: 'Unknown', trim: true },
  country:            { type: String, default: 'Unknown', trim: true },
  priority:           { type: String, enum: ['low','medium','high'], required: true, index: true },
  email:              { type: String, required: true, lowercase: true, trim: true, index: true },
  reportedAt:         { type: Date, default: Date.now, index: true },
  imageUrl:           { type: String, default: null, trim: true },
  recognizedCategory: { type: String, default: 'Analysis Pending', trim: true },
  isClean:            { type: Boolean, default: false, index: true }
});
const Report = mongoose.model('Report', reportSchema, 'reports');

// ─── Helper: reverse-geocode ────────────────────────────────────────────────
async function getAddressFromCoordsServer(lat, lng) {
  if (!GOOGLE_MAPS_API_KEY) {
    console.warn('Skipping geocoding (API key missing).');
    return { town:'Skipped', county:'Skipped', country:'Skipped' };
  }
  const url =
    `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`;
  try {
    const resp = await fetch(url);
    const data = await resp.json();
    if (data.status === 'OK' && data.results?.[0]?.address_components) {
      let town, county, country;
      for (const c of data.results[0].address_components) {
        if (c.types.includes('locality')) town = c.long_name;
        else if (c.types.includes('postal_town') && !town) town = c.long_name;
        else if (c.types.includes('administrative_area_level_2')) county = c.long_name;
        else if (c.types.includes('administrative_area_level_1') && !county) county = c.long_name;
        else if (c.types.includes('country')) country = c.long_name;
      }
      return {
        town:    town    || 'Unknown',
        county:  county  || 'Unknown',
        country: country || 'Unknown'
      };
    }
    console.warn(`Geocoding API status: ${data.status}`);
    return { town:'Lookup Failed', county:'Lookup Failed', country:'Lookup Failed' };
  } catch (err) {
    console.error('Geocoding fetch error:', err);
    return { town:'Error', county:'Error', country:'Error' };
  }
}

// ─── Helper: Azure image analysis ───────────────────────────────────────────
async function analyzeImageWithAzure(imageUrl) {
  if (!AZURE_CV_KEY || !AZURE_CV_ENDPOINT) {
    console.warn('Skipping Azure analysis (creds missing).');
    return 'Analysis Skipped';
  }
  try { new URL(imageUrl); } catch {
    console.warn('Invalid image URL for Azure analysis:', imageUrl);
    return 'Analysis Failed - Invalid URL';
  }
  const endpoint   = AZURE_CV_ENDPOINT.replace(/\/$/, '');
  const requestUrl = `${endpoint}/computervision/imageanalysis:analyze?api-version=2023-02-01-preview&features=tags,caption`;
  try {
    const resp = await fetch(requestUrl, {
      method : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': AZURE_CV_KEY
      },
      body   : JSON.stringify({ url: imageUrl })
    });
    const body = await resp.text();
    if (!resp.ok) {
      console.error(`Azure API ${resp.status}:`, body);
      return `Analysis Failed (${resp.status})`;
    }
    const data = JSON.parse(body);
    const relevant = ['trash','waste','litter','garbage','pollution','dump','rubbish',
                      'plastic','bottle','can','debris'];
    const tag = data.tagsResult?.values?.find(t =>
      relevant.includes(t.name.toLowerCase()));
    if (tag)                      return tag.name.charAt(0).toUpperCase() + tag.name.slice(1);
    if (data.captionResult?.text) return data.captionResult.text;
    if (data.tagsResult?.values?.length) {
      const first = data.tagsResult.values[0].name;
      return first.charAt(0).toUpperCase() + first.slice(1);
    }
    return 'Analysis Complete - No Category';
  } catch (err) {
    console.error('Azure analysis error:', err);
    return 'Analysis Error';
  }
}

// ─── Helper: delete object from S3 ──────────────────────────────────────────
async function deleteS3Object(imageUrl) {
  if (!s3Client) {
    console.warn('Skipping S3 delete (client not configured).');
    return false;
  }
  let key = '';
  const prefixes = [
    `https://${S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/`,
    `https://s3.${AWS_REGION}.amazonaws.com/${S3_BUCKET_NAME}/`
  ];
  for (const p of prefixes) {
    if (imageUrl.startsWith(p)) {
      key = decodeURIComponent(imageUrl.slice(p.length));
      break;
    }
  }
  if (!key) {
    console.warn('Could not extract key from S3 URL:', imageUrl);
    return false;
  }
  try {
    await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET_NAME, Key: key }));
    console.log('Deleted S3 object:', key);
    return true;
  } catch (err) {
    console.error('Error deleting S3 object:', err);
    return false;
  }
}

// ──────────────────────────── ROUTES ───────────────────────────────────────

// POST /report  ─ create new report
app.post('/report', async (req, res) => {
  try {
    let { latitude, longitude, town, county, country,
          priority, email, imageUrl } = req.body;

    if (typeof latitude  !== 'number' ||
        typeof longitude !== 'number' ||
        !['low','medium','high'].includes(priority) ||
        typeof email !== 'string' ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid input data.' });
    }

    // Reverse-geocode if missing/invalid address
    const needGeocode = !town || town.includes('Error') ||
                        !county || county.includes('Error') ||
                        !country || country.includes('Error');
    if (needGeocode) {
      console.log(`Geocoding for ${latitude},${longitude}`);
      const addr = await getAddressFromCoordsServer(latitude, longitude);
      town    = town    && !town.includes('Error')    ? town    : addr.town;
      county  = county  && !county.includes('Error')  ? county  : addr.county;
      country = country && !country.includes('Error') ? country : addr.country;
    }

    // Analyse image (if supplied)
    let recognised = 'Analysis Pending';
    if (imageUrl && typeof imageUrl === 'string') {
      console.log(`Analysing image: ${imageUrl}`);
      recognised = await analyzeImageWithAzure(imageUrl);
    } else {
      imageUrl = null;
    }

    const report = await Report.create({
      latitude,
      longitude,
      town,
      county,
      country,
      priority,
      email: email.toLowerCase().trim(),
      imageUrl,
      recognizedCategory: recognised,
      reportedAt: new Date()
    });

    console.log('Saved report:', report._id);
    res.status(201).json({ message: 'Report saved successfully', report });

  } catch (err) {
    console.error('Error in POST /report:', err);
    res.status(500).json({ error: 'Server error while saving report.' });
  }
});

// GET /reports  ─ paginated list
app.get('/reports', async (req, res) => {
  try {
    const { email, page = 1, limit = 50, includeClean = 'false' } = req.query;
    const filter = {};
    if (email) filter.email = String(email).toLowerCase();
    if (String(includeClean).toLowerCase() !== 'true')
      filter.isClean = { $ne: true };

    const pageNum  = Math.max(1, parseInt(page,10));
    const limitNum = Math.min(1000, Math.max(1, parseInt(limit,10)));
    const skip     = (pageNum - 1) * limitNum;

    const reports = await Report.find(filter)
                                .sort({ reportedAt: -1 })
                                .skip(skip)
                                .limit(limitNum);
    res.status(200).json(reports);
  } catch (err) {
    console.error('Error in GET /reports:', err);
    res.status(500).json({ error: 'Server error while fetching reports.' });
  }
});

// PATCH /report/image/:id  ─ update image & re-analyse
app.patch('/report/image/:id', async (req, res) => {
  const { id } = req.params;
  const { imageUrl } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id) ||
      typeof imageUrl !== 'string' || !imageUrl.trim()) {
    return res.status(400).json({ error: 'Invalid input.' });
  }

  try {
    const report = await Report.findById(id);
    if (!report) return res.status(404).json({ error: 'Report not found.' });

    if (report.imageUrl && report.imageUrl !== imageUrl) {
      console.log(`Deleting old S3 image for ${id}`);
      await deleteS3Object(report.imageUrl);
    }

    const recognised = await analyzeImageWithAzure(imageUrl);
    report.imageUrl           = imageUrl;
    report.recognizedCategory = recognised;
    await report.save();

    res.status(200).json({ message: 'Image updated', report });
  } catch (err) {
    console.error(`Error in PATCH /report/image/${id}:`, err);
    res.status(500).json({ error: 'Server error while updating image.' });
  }
});

// PATCH /report/clean  ─ mark as cleaned
app.patch('/report/clean', async (req, res) => {
  const { reportId } = req.body;
  if (!mongoose.Types.ObjectId.isValid(reportId))
    return res.status(400).json({ error: 'Invalid report ID.' });

  try {
    const report = await Report.findById(reportId);
    if (!report) return res.status(404).json({ error: 'Report not found.' });
    if (report.isClean)
      return res.status(200).json({ message: 'Already marked clean.', report });

    if (report.imageUrl) await deleteS3Object(report.imageUrl);
    report.isClean = true;
    report.imageUrl = null;
    report.recognizedCategory = 'Cleaned';
    await report.save();

    res.status(200).json({ message: 'Report marked clean.', report });
  } catch (err) {
    console.error('Error in PATCH /report/clean:', err);
    res.status(500).json({ error: 'Server error while marking clean.' });
  }
});

// DELETE /report/:id  ─ delete entire report
app.delete('/report/:id', async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id))
    return res.status(400).json({ error: 'Invalid report ID.' });

  try {
    const report = await Report.findById(id);
    if (!report) return res.status(404).json({ error: 'Report not found.' });

    if (report.imageUrl) await deleteS3Object(report.imageUrl);
    await report.deleteOne();

    res.status(200).json({ message: 'Report deleted.', reportId: id });
  } catch (err) {
    console.error(`Error in DELETE /report/${id}:`, err);
    res.status(500).json({ error: 'Server error while deleting report.' });
  }
});

// DELETE /report/image/:id  ─ delete only the image
app.delete('/report/image/:id', async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id))
    return res.status(400).json({ error: 'Invalid report ID.' });

  try {
    const report = await Report.findById(id);
    if (!report) return res.status(404).json({ error: 'Report not found.' });
    if (!report.imageUrl)
      return res.status(400).json({ error: 'No image to delete.' });

    await deleteS3Object(report.imageUrl);
    report.imageUrl = null;
    report.recognizedCategory = 'Analysis Pending';
    await report.save();

    res.status(200).json({ message: 'Image deleted.', report });
  } catch (err) {
    console.error(`Error in DELETE /report/image/${id}:`, err);
    res.status(500).json({ error: 'Server error while deleting image.' });
  }
});

// GET /leaderboard  ─ simple stats
app.get('/leaderboard', async (req, res) => {
  try {
    const board = await Report.aggregate([
      { $match: { isClean: { $ne: true } } },
      { $group: {
          _id: '$email',
          totalReports:   { $sum: 1 },
          highPriority:   { $sum: { $cond: [{ $eq: ['$priority','high'] }, 1, 0] } },
          mediumPriority: { $sum: { $cond: [{ $eq: ['$priority','medium'] }, 1, 0] } },
          lowPriority:    { $sum: { $cond: [{ $eq: ['$priority','low'] }, 1, 0] } }
      }},
      { $sort: { totalReports: -1 } },
      { $limit: 100 },
      { $project: {
          _id:0,
          email:'$_id',
          totalReports:1,
          highPriority:1,
          mediumPriority:1,
          lowPriority:1
      }}
    ]);
    res.status(200).json(board);
  } catch (err) {
    console.error('Error in GET /leaderboard:', err);
    res.status(500).json({ error: 'Server error generating leaderboard.' });
  }
});

// Health-check
app.get('/', (_, res) => {
  res.send('LitterWarden Server is running!');
});

// 404 handler
app.use((req, res) => {
  console.warn(`404: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: 'Route not found' });
});

// ─── Global error & unhandled rejection handlers ───────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack || err);
  res.status(500).json({ error: 'Internal server error' });
});

process.on('unhandledRejection', reason => {
  console.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', err => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

// ─── Start server ───────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀  Server running on http://localhost:${PORT}`);
});
