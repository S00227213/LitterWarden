require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const fetch = require('node-fetch');
const { URL } = require('url');
const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const s3Routes = require('./routes/s3');

const app = express();
app.use(express.json());
app.use(cors({ origin: '*' }));
app.use('/s3', s3Routes);

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

// --- sanity checks
if (!MONGO_URI) {
  console.error("FATAL: MONGO_URI missing.");
  process.exit(1);
}
if (!GOOGLE_MAPS_API_KEY) {
  console.warn("Warning: GOOGLE_MAPS_API_KEY missing.");
}
if (!AZURE_CV_KEY || !AZURE_CV_ENDPOINT) {
  console.warn("Warning: AZURE_CV_KEY or AZURE_CV_ENDPOINT missing.");
}
if (!S3_BUCKET_NAME) {
  console.warn("Warning: S3_BUCKET_NAME missing.");
}
if (!AWS_REGION) {
  console.warn("Warning: AWS_REGION missing.");
}
if (!AWS_ACCESS_KEY_ID) {
  console.warn("Warning: AWS_ACCESS_KEY_ID missing.");
}
if (!AWS_SECRET_ACCESS_KEY) {
  console.warn("Warning: AWS_SECRET_ACCESS_KEY missing.");
}

// --- S3 client for deletes
let s3Client;
if (AWS_REGION && AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY && S3_BUCKET_NAME) {
  s3Client = new S3Client({
    region: AWS_REGION,
    credentials: {
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY,
    }
  });
  console.log(`S3 Client configured for region: ${AWS_REGION}`);
} else {
  console.warn("S3 Client not configured due to missing credentials.");
  s3Client = null;
}

// --- connect to Mongo
mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// --- Report schema/model
const reportSchema = new mongoose.Schema({
  latitude:         { type: Number, required: true, index: true },
  longitude:        { type: Number, required: true, index: true },
  town:             { type: String, default: 'Unknown', trim: true },
  county:           { type: String, default: 'Unknown', trim: true },
  country:          { type: String, default: 'Unknown', trim: true },
  priority:         { type: String, enum: ['low','medium','high'], required: true },
  email:            { type: String, required: true, lowercase: true, trim: true, index: true },
  reportedAt:       { type: Date, default: Date.now, index: true },
  imageUrl:         { type: String, default: null, trim: true },
  recognizedCategory:{ type: String, default: 'Analysis Pending', trim: true },
  isClean:          { type: Boolean, default: false, index: true },
});
const Report = mongoose.model('Report', reportSchema, 'reports');

// --- geocode helper (server‐side fallback)
async function getAddressFromCoordsServer(latitude, longitude) {
  if (!GOOGLE_MAPS_API_KEY) {
    return { town:'Skipped', county:'Skipped', country:'Skipped' };
  }
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`;
  try {
    const resp = await fetch(url);
    const data = await resp.json();
    if (data.status === 'OK' && data.results.length) {
      let town, county, country;
      data.results[0].address_components.forEach(c => {
        if (c.types.includes('locality')) town = c.long_name;
        else if (c.types.includes('administrative_area_level_2')) county = c.long_name;
        else if (c.types.includes('country')) country = c.long_name;
      });
      return {
        town:   town   || 'Unknown',
        county: county || 'Unknown',
        country:country || 'Unknown'
      };
    }
    return { town:'Failed', county:'Failed', country:'Failed' };
  } catch (e) {
    console.error('Geocode error:', e);
    return { town:'Error', county:'Error', country:'Error' };
  }
}

// --- image analysis helper
async function analyzeImageWithAzure(imageUrl) {
  if (!AZURE_CV_KEY || !AZURE_CV_ENDPOINT || !imageUrl) {
    return 'Analysis Skipped';
  }
  try {
    new URL(imageUrl);
  } catch {
    return 'Analysis Failed - Invalid URL';
  }
  try {
    const resp = await fetch(AZURE_CV_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': AZURE_CV_KEY
      },
      body: JSON.stringify({ url: imageUrl })
    });
    if (!resp.ok) {
      const txt = await resp.text();
      console.error(`Azure API error ${resp.status}:`, txt);
      return 'Analysis Failed';
    }
    const data = await resp.json();
    let category = 'Analysis Done - Unknown';
    if (data.description?.captions?.length) {
      category = data.description.captions[0].text;
    }
    if (data.tags?.length) {
      const tag = data.tags.find(t => ['trash','waste','litter','garbage','pollution','dump','rubbish','plastic','bottle','can'].includes(t.name.toLowerCase()));
      if (tag) category = tag.name.charAt(0).toUpperCase() + tag.name.slice(1);
      else category = data.tags[0].name.charAt(0).toUpperCase() + data.tags[0].name.slice(1);
    }
    return category;
  } catch (e) {
    console.error('Azure analysis error:', e);
    return 'Analysis Error';
  }
}

// --- delete S3 object
async function deleteS3Object(imageUrl) {
  if (!s3Client) {
    console.warn('Skipping S3 delete: client not configured.');
    return false;
  }
  let key = '';
  const p1 = `https://${S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/`;
  const p2 = `https://s3.${AWS_REGION}.amazonaws.com/${S3_BUCKET_NAME}/`;
  if (imageUrl.startsWith(p1)) key = decodeURIComponent(imageUrl.slice(p1.length));
  else if (imageUrl.startsWith(p2)) key = decodeURIComponent(imageUrl.slice(p2.length));
  if (!key) {
    console.warn('URL not in bucket, skipping delete:', imageUrl);
    return false;
  }
  try {
    await s3Client.send(new DeleteObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: key
    }));
    console.log('Deleted S3 object:', key);
    return true;
  } catch (e) {
    console.error('Error deleting S3 object:', e);
    return false;
  }
}

//  POST /report
app.post('/report', async (req, res) => {
  try {
    let { latitude, longitude, town, county, country, priority, email } = req.body;
    if (
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      !['low','medium','high'].includes(priority) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return res.status(400).json({ error: 'Invalid input' });
    }

    // fallback geocode if needed
    const needLookup = !town || town.includes('Error') || !county || !country;
    if (needLookup) {
      const loc = await getAddressFromCoordsServer(latitude, longitude);
      town   = loc.town   || town;
      county = loc.county || county;
      country= loc.country|| country;
    }

    const newRep = await Report.create({
      latitude, longitude, priority,
      town:   town   || 'Unknown',
      county: county || 'Unknown',
      country:country|| 'Unknown',
      email: email.toLowerCase().trim()
    });
    res.status(201).json({ message: 'Report saved', report: newRep });
  } catch (e) {
    console.error('POST /report error:', e);
    res.status(500).json({ error: 'Server error saving report' });
  }
});

//  GET /reports
app.get('/reports', async (req, res) => {
  console.log('GET /reports with', req.query);
  try {
    const { email, page = 1, limit = 50, includeClean = 'false' } = req.query;
    const filter = {};
    if (email) filter.email = email.toLowerCase();
    if (includeClean !== 'true') filter.isClean = { $ne: true };

    const pageNum  = Math.max(1, parseInt(page,  10) || 1);
    const limitNum = Math.min(1000, Math.max(1, parseInt(limit, 10) || 50));

    const arr = await Report
      .find(filter)
      .sort({ reportedAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    res.json(arr);
  } catch (e) {
    console.error('GET /reports error:', e);
    res.status(500).json({ error: 'Server error fetching reports' });
  }
});

//  PATCH /report/image/:id
app.patch('/report/image/:id', async (req, res) => {
  const id = req.params.id;
  const { imageUrl } = req.body;
  if (!mongoose.Types.ObjectId.isValid(id) || typeof imageUrl !== 'string') {
    return res.status(400).json({ error: 'Invalid ID or URL' });
  }
  try {
    const rpt = await Report.findById(id);
    if (!rpt) return res.status(404).json({ error: 'Not found' });

    const analysis = await analyzeImageWithAzure(imageUrl);
    const updated = await Report.findByIdAndUpdate(id, {
      imageUrl, recognizedCategory: analysis
    }, { new: true });

    res.json({ message: 'Image saved', report: updated });
  } catch (e) {
    console.error('PATCH /report/image error:', e);
    res.status(500).json({ error: 'Server error updating image' });
  }
});

//  PATCH /report/clean
app.patch('/report/clean', async (req, res) => {
  const { reportId } = req.body;
  if (!mongoose.Types.ObjectId.isValid(reportId)) {
    return res.status(400).json({ error: 'Invalid reportId' });
  }
  try {
    const rep = await Report.findById(reportId);
    if (!rep) return res.status(404).json({ error: 'Not found' });
    if (rep.imageUrl) {
      await deleteS3Object(rep.imageUrl);
    }
    const upd = await Report.findByIdAndUpdate(reportId, {
      isClean: true, imageUrl: null, recognizedCategory: 'Cleaned'
    }, { new: true });
    res.json({ message: 'Marked clean', report: upd });
  } catch (e) {
    console.error('PATCH /report/clean error:', e);
    res.status(500).json({ error: 'Server error marking clean' });
  }
});

//  DELETE /report/:id
app.delete('/report/:id', async (req, res) => {
  const id = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Invalid ID' });
  }
  try {
    const rep = await Report.findById(id);
    if (!rep) return res.status(404).json({ error: 'Not found' });
    if (rep.imageUrl) await deleteS3Object(rep.imageUrl);
    await Report.findByIdAndDelete(id);
    res.json({ message: 'Deleted', report: rep });
  } catch (e) {
    console.error('DELETE /report/:id error:', e);
    res.status(500).json({ error: 'Server error deleting report' });
  }
});

//  DELETE /report/image/:id
app.delete('/report/image/:id', async (req, res) => {
  const id = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Invalid ID' });
  }
  try {
    const rpt = await Report.findById(id);
    if (!rpt) return res.status(404).json({ error: 'Not found' });
    if (!rpt.imageUrl) {
      return res.status(400).json({ error: 'No image to delete' });
    }
    await deleteS3Object(rpt.imageUrl);
    const upd = await Report.findByIdAndUpdate(id, {
      imageUrl: null, recognizedCategory: 'Analysis Pending'
    }, { new: true });
    res.json({ message: 'Image removed', report: upd });
  } catch (e) {
    console.error('DELETE /report/image/:id error:', e);
    res.status(500).json({ error: 'Server error deleting image' });
  }
});

//  root health check
app.get('/', (req, res) => {
  res.send('LitterWarden Server is running!');
});

//  404 fallback
app.use((req, res) => {
  console.warn(`No route for [${req.method}] ${req.originalUrl}`);
  res.status(404).json({ error: 'Route not found' });
});

//  start
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
