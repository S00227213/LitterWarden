require('dotenv').config(); 
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const { URL } = require('url');

const app = express();
app.use(express.json());
app.use(cors());

// Serve uploads folder
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
  console.log(`Created uploads dir: ${uploadDir}`);
}
app.use('/uploads', express.static(uploadDir));
console.log(`Serving ${uploadDir} at /uploads`);

// Env vars
const MONGO_URI = process.env.MONGO_URI;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const AZURE_CV_KEY = process.env.AZURE_CV_KEY;
const AZURE_CV_ENDPOINT = process.env.AZURE_CV_ENDPOINT;
const NGROK_URL = process.env.NGROK_URL;

if (!MONGO_URI) { console.error("MONGO_URI missing."); process.exit(1); }
if (!GOOGLE_MAPS_API_KEY) { console.warn("GOOGLE_MAPS_API_KEY missing."); }
if (!AZURE_CV_KEY || !AZURE_CV_ENDPOINT) { console.warn("AZURE vars missing."); }
if (!NGROK_URL) { console.warn("NGROK_URL missing."); }

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('MongoDB Connected');
  } catch (error) {
    console.error('MongoDB Error:', error.message);
    process.exit(1);
  }
};
connectDB();

// Mongoose Schema & Model
const reportSchema = new mongoose.Schema({
  latitude: { type: Number, required: true, index: true },
  longitude: { type: Number, required: true, index: true },
  town: { type: String, default: 'Unknown', trim: true },
  county: { type: String, default: 'Unknown', trim: true },
  country: { type: String, default: 'Unknown', trim: true },
  priority: { type: String, enum: ['low', 'medium', 'high'], required: true },
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  reportedAt: { type: Date, default: Date.now, index: true },
  imageUrl: { type: String, trim: true, default: null },
  recognizedCategory: { type: String, trim: true, default: 'Analysis Pending' },
  isClean: { type: Boolean, default: false, index: true },
});
const Report = mongoose.model('Report', reportSchema, 'reports');

// Server-side geocoding
const getAddressFromCoordsServer = async (latitude, longitude) => {
  if (!GOOGLE_MAPS_API_KEY) {
    console.warn("No API key for geocoding.");
    return { town: 'Server Lookup Skipped', county: 'Server Lookup Skipped', country: 'Server Lookup Skipped' };
  }
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`;
  console.log(`Geocoding: ${latitude}, ${longitude}`);
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Status ${response.status}`);
    const data = await response.json();
    if (data.status === 'OK' && data.results.length > 0) {
      let town = null, county = null, country = null;
      const comps = data.results[0].address_components;
      for (const comp of comps) {
        const types = comp.types;
        if (types.includes('locality')) town = comp.long_name;
        else if (types.includes('postal_town') && !town) town = comp.long_name;
        if (types.includes('administrative_area_level_2')) county = comp.long_name;
        else if (types.includes('administrative_area_level_1') && !county) county = comp.long_name;
        if (types.includes('country')) country = comp.long_name;
      }
      console.log("Geocode:", { town, county, country });
      return { town: town || 'Unknown', county: county || 'Unknown', country: country || 'Unknown' };
    } else {
      console.warn(`Geocode failed: ${data.status}`);
      return { town: 'Server Lookup Failed', county: 'Server Lookup Failed', country: 'Server Lookup Failed' };
    }
  } catch (error) {
    console.error('Geocode error:', error);
    return { town: 'Server Network Error', county: 'Server Network Error', country: 'Server Network Error' };
  }
};

// Azure Computer Vision Analysis
const analyzeImageWithAzure = async (imageUrl) => {
  if (!AZURE_CV_KEY || !AZURE_CV_ENDPOINT || !imageUrl) {
    console.warn('Skipping Azure analysis.');
    return 'Analysis Skipped';
  }
  console.log(`Analyzing image: ${imageUrl}`);
  try {
    const response = await fetch(AZURE_CV_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': AZURE_CV_KEY,
      },
      body: JSON.stringify({ url: imageUrl }),
    });
    if (!response.ok) {
      const errBody = await response.text();
      console.error(`Azure Error: ${response.status}`, errBody);
      return 'Analysis Failed';
    }
    const data = await response.json();
    console.log('Azure Response:', JSON.stringify(data, null, 2));
    let category = 'Analysis Done';
    if (data.tags && data.tags.length > 0) {
      const tag = data.tags.find(t => ['trash', 'waste', 'litter', 'garbage', 'pollution', 'dump', 'rubbish'].includes(t.name.toLowerCase()));
      category = tag ? tag.name.charAt(0).toUpperCase() + tag.name.slice(1) : data.tags[0].name.charAt(0).toUpperCase() + data.tags[0].name.slice(1);
    } else if (data.description && data.description.captions && data.description.captions.length > 0) {
      category = data.description.captions[0].text;
    }
    console.log('Category:', category);
    return category;
  } catch (error) {
    console.error('Azure API error:', error);
    return 'Analysis Error';
  }
};

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const reportId = req.body.reportId || 'unknown_report';
    cb(null, `${reportId}-${unique}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// POST /report
app.post('/report', async (req, res) => {
  try {
    let { latitude, longitude, town, county, country, priority, email } = req.body;
    if (typeof latitude !== 'number' || typeof longitude !== 'number' || !priority || !email) {
      return res.status(400).json({ error: 'Missing/invalid fields' });
    }
    if (!['low', 'medium', 'high'].includes(priority)) {
      return res.status(400).json({ error: 'Invalid priority.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email.' });
    }
    console.log('Report Data:', req.body);
    const lookupFailed = !town || ['Unknown','Config Error','Lookup Failed','Lookup Skipped'].includes(town) ||
                         !county || ['Unknown','Config Error','Lookup Failed','Lookup Skipped'].includes(county) ||
                         !country || ['Unknown','Config Error','Lookup Failed','Lookup Skipped'].includes(country);
    if (lookupFailed) {
      console.log("Incomplete lookup, using server geocode...");
      const locData = await getAddressFromCoordsServer(latitude, longitude);
      if (!['Server Lookup Skipped','Server Lookup Failed','Server Network Error'].includes(locData.town)) {
        town = locData.town; county = locData.county; country = locData.country;
      } else {
        town = town || 'Unknown'; county = county || 'Unknown'; country = country || 'Unknown';
      }
    }
    const reportToSave = { latitude, longitude, town, county, country, priority, email: email.toLowerCase() };
    console.log('Saving Report:', reportToSave);
    const newReport = await Report.create(reportToSave);
    res.status(201).json({ message: 'Report saved!', report: newReport });
  } catch (error) {
    console.error('Save Report Error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: 'Validation Error', details: error.message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /report/upload
app.post('/report/upload', upload.single('image'), async (req, res) => {
  try {
    const reportId = req.body.reportId;
    if (!req.file) return res.status(400).json({ error: 'No image uploaded.' });
    if (!reportId) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Missing reportId.' });
    }
    if (!mongoose.Types.ObjectId.isValid(reportId)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Invalid reportId.' });
    }
    console.log(`Image for report ${reportId}:`, req.file);
    const imageUrl = NGROK_URL ? `${NGROK_URL}/uploads/${req.file.filename}` : null;
    if (!imageUrl) console.warn("NGROK_URL not set.");
    console.log(`Image URL: ${imageUrl}`);
    const analysisResult = await analyzeImageWithAzure(imageUrl);
    const updatedReport = await Report.findByIdAndUpdate(
      reportId,
      { $set: { imageUrl, recognizedCategory: analysisResult } },
      { new: true }
    );
    if (!updatedReport) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Report not found.' });
    }
    console.log(`Report ${reportId} updated with image.`);
    res.json({ message: 'Image uploaded and analyzed!', report: updatedReport });
  } catch (error) {
    console.error('Image Upload Error:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
        console.log("Cleaned up file.");
      } catch (cleanupError) {
        console.error("Cleanup Error:", cleanupError);
      }
    }
    res.status(500).json({ error: 'Error during image upload.' });
  }
});

// GET /reports
app.get('/reports', async (req, res) => {
  try {
    const { email, page = 1, limit = 50, includeClean = 'false' } = req.query;
    const filter = {};
    if (email) filter.email = email.toLowerCase();
    if (includeClean !== 'true') filter.isClean = { $ne: true };
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    if (isNaN(pageNum) || pageNum < 1 || isNaN(limitNum) || limitNum < 1) {
      return res.status(400).json({ error: 'Invalid page or limit.' });
    }
    const reports = await Report.find(filter)
      .sort({ reportedAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);
    res.json(reports);
  } catch (error) {
    console.error('Fetch Reports Error:', error);
    res.status(500).json({ error: 'Error fetching reports.' });
  }
});

// PATCH /report/clean
app.patch('/report/clean', async (req, res) => {
  try {
    const { reportId } = req.body;
    if (!reportId) return res.status(400).json({ error: 'Missing reportId.' });
    if (!mongoose.Types.ObjectId.isValid(reportId)) return res.status(400).json({ error: 'Invalid reportId.' });
    const reportToClean = await Report.findById(reportId);
    if (!reportToClean) return res.status(404).json({ error: 'Report not found.' });
    if (reportToClean.imageUrl) {
      try {
        const parsedUrl = new URL(reportToClean.imageUrl);
        const filename = path.basename(parsedUrl.pathname);
        const filePath = path.join(uploadDir, filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`Deleted image: ${filePath}`);
        } else {
          console.log(`Image not found: ${filePath}`);
        }
      } catch (imgError) {
        console.error(`Error deleting image for ${reportId}:`, imgError);
      }
    }
    const updatedReport = await Report.findByIdAndUpdate(
      reportId,
      { $set: { isClean: true, imageUrl: null, recognizedCategory: 'Cleaned' } },
      { new: true }
    );
    console.log(`Report ${reportId} marked clean.`);
    res.json({ message: 'Report marked clean!', report: updatedReport });
  } catch (error) {
    console.error('Clean Report Error:', error);
    res.status(500).json({ error: 'Error marking report clean.' });
  }
});

// DELETE /report/:id
app.delete('/report/:id', async (req, res) => {
  try {
    const reportId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(reportId)) return res.status(400).json({ error: 'Invalid report ID.' });
    const deletedReport = await Report.findByIdAndDelete(reportId);
    if (!deletedReport) return res.status(404).json({ error: 'Report not found.' });
    if (deletedReport.imageUrl) {
      try {
        const parsedUrl = new URL(deletedReport.imageUrl);
        const filename = path.basename(parsedUrl.pathname);
        const filePath = path.join(uploadDir, filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`Deleted image: ${filePath}`);
        } else {
          console.log(`Image not found: ${filePath}`);
        }
      } catch (imgError) {
        console.error(`Error deleting image for ${reportId}:`, imgError);
      }
    }
    console.log(`Report ${reportId} deleted.`);
    res.json({ message: 'Report deleted!', report: deletedReport });
  } catch (error) {
    console.error('Delete Report Error:', error);
    res.status(500).json({ error: 'Error deleting report.' });
  }
});

// DELETE /report/image/:id
app.delete('/report/image/:id', async (req, res) => {
  try {
    const reportId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(reportId)) return res.status(400).json({ error: 'Invalid report ID.' });
    const report = await Report.findById(reportId);
    if (!report) return res.status(404).json({ error: 'Report not found.' });
    if (!report.imageUrl) return res.status(400).json({ error: 'No image to delete.' });
    try {
      const parsedUrl = new URL(report.imageUrl);
      const filename = path.basename(parsedUrl.pathname);
      const filePath = path.join(uploadDir, filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`Deleted image file: ${filePath}`);
      } else {
        console.log(`Image not found for deletion: ${filePath}`);
      }
    } catch (imgError) {
      console.error(`Error deleting image for ${reportId}:`, imgError);
    }
    const updatedReport = await Report.findByIdAndUpdate(
      reportId,
      { $set: { imageUrl: null, recognizedCategory: 'Analysis Pending' } },
      { new: true }
    );
    if (!updatedReport) return res.status(404).json({ error: 'Report not found after deletion.' });
    console.log(`Image cleared for report ${reportId}.`);
    res.json({ message: 'Image deleted!', report: updatedReport });
  } catch (error) {
    console.error('Delete Image Error:', error);
    if (error instanceof mongoose.Error.CastError) return res.status(400).json({ error: 'Invalid report ID.' });
    res.status(500).json({ error: 'Error deleting image.' });
  }
});

// Root route
app.get('/', (req, res) => {
  res.send('LitterWarden Server is running!');
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
