require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const fetch = require('node-fetch');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

console.log('Loaded Azure Vision API Key:', process.env.AZURE_VISION_API_KEY);

const app = express();
app.use(express.json());
app.use(cors());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({ storage });

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB Connected');
  } catch (error) {
    console.error('MongoDB Connection Error:', error);
    process.exit(1);
  }
};
connectDB();

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const AZURE_VISION_API_KEY = '5CzuKzCJQ9uxVreZfaparyC4xrBPvNZbIkMRnPwjgieM5aeZY6pbJQQJ99BCAC5RqLJXJ3w3AAAFACOG77pG';

const reportSchema = new mongoose.Schema({
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  town: { type: String, default: 'Unknown' },
  county: { type: String, default: 'Unknown' },
  country: { type: String, default: 'Unknown' },
  priority: { type: String, enum: ['low', 'medium', 'high', 'clean'], required: true },
  email: { type: String, required: true, match: /.+\@.+\..+/ },
  reportedAt: { type: Date, default: Date.now },
  clearedAt: { type: Date },
  evidence: { type: String },
  imageUrl: { type: String },
});
const Report = mongoose.model('Report', reportSchema, 'reports');

const getAddressFromCoords = async (latitude, longitude) => {
  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`
    );
    const data = await response.json();
    if (data.status === 'OK' && data.results.length > 0) {
      let town = 'Unknown';
      let county = 'Unknown';
      let country = 'Unknown';
      data.results[0].address_components.forEach((component) => {
        if (component.types.includes('locality')) town = component.long_name;
        if (component.types.includes('administrative_area_level_2')) county = component.long_name;
        if (component.types.includes('country')) country = component.long_name;
      });
      return { town, county, country };
    }
  } catch (error) {
    console.error('Error fetching address:', error);
  }
  return { town: 'Unknown', county: 'Unknown', country: 'Unknown' };
};

app.post('/report', upload.single('photo'), async (req, res) => {
  try {
    let { latitude, longitude, priority, email } = req.body;
    if (!latitude || !longitude || !priority || !email) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    let { town, county, country } = await getAddressFromCoords(latitude, longitude);
    let imageUrl = '';
    if (req.file) {
      imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    }
    const newReport = await Report.create({
      latitude,
      longitude,
      town,
      county,
      country,
      priority,
      email,
      imageUrl,
    });
    res.status(201).json({ message: 'Report saved successfully!', report: newReport });
  } catch (error) {
    console.error('Error saving report:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/reports', async (req, res) => {
  try {
    const { email, page = 1, limit = 20 } = req.query;
    const filter = email ? { email } : {};
    const reports = await Report.find(filter)
      .sort({ reportedAt: -1 })
      .skip((page - 1) * parseInt(limit))
      .limit(parseInt(limit));
    res.json(reports);
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/report/:id', async (req, res) => {
  try {
    const reportId = req.params.id;
    const deletedReport = await Report.findByIdAndDelete(reportId);
    if (!deletedReport) return res.status(404).json({ error: 'Report not found' });
    res.json({ message: 'Report deleted successfully!', report: deletedReport });
  } catch (error) {
    console.error('Error deleting report:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/report/:id/clean', async (req, res) => {
  try {
    const reportId = req.params.id;
    const updatedReport = await Report.findByIdAndUpdate(
      reportId,
      { priority: 'clean', clearedAt: Date.now() },
      { new: true }
    );
    if (!updatedReport) {
      return res.status(404).json({ error: 'Report not found' });
    }
    console.log(`Push notification sent to ${updatedReport.email}: Your litter report has been cleared.`);
    res.json({ message: 'Report marked as clean successfully!', report: updatedReport });
  } catch (error) {
    console.error('Error marking report as clean:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/report/:id/clear', upload.single('photo'), async (req, res) => {
  try {
    const reportId = req.params.id;
    console.log(`PUT /report/${reportId}/clear called`);
    if (!req.file) {
      console.log('No photo file provided.');
      return res.status(400).json({ error: 'No photo uploaded' });
    }
    console.log('Multer saved file as:', req.file.filename);
    const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    console.log('Local image URL:', imageUrl);
    const azureEndpoint =
      'https://litterwarden.cognitiveservices.azure.com/vision/v3.2/analyze?visualFeatures=Categories,Description,Tags';
    const bodyData = { url: imageUrl };
    console.log('Sending request to Azure Vision API at:', azureEndpoint);
    console.log('Request body:', JSON.stringify(bodyData));
    const azureResponse = await fetch(azureEndpoint, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': AZURE_VISION_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodyData),
    });
    console.log('Azure response status:', azureResponse.status);
    let recognizedLitter = 'Not Recognized';
    if (azureResponse.ok) {
      const analysisResult = await azureResponse.json();
      console.log('Azure Analysis Result:', JSON.stringify(analysisResult, null, 2));
      if (analysisResult.description?.captions?.length > 0) {
        recognizedLitter = analysisResult.description.captions[0].text;
      }
    } else {
      const errorText = await azureResponse.text();
      console.error('Azure API error:', errorText);
      recognizedLitter = 'Recognition error';
    }
    console.log('Final recognizedLitter:', recognizedLitter);
    const updatedReport = await Report.findByIdAndUpdate(
      reportId,
      {
        priority: 'clean',
        clearedAt: Date.now(),
        evidence: recognizedLitter,
        imageUrl,
      },
      { new: true }
    );
    if (!updatedReport) {
      console.error('Report not found when updating.');
      return res.status(404).json({ error: 'Report not found' });
    }
    console.log('Updated Report:', JSON.stringify(updatedReport, null, 2));
    console.log(`Push notification sent to ${updatedReport.email}: Your litter report has been cleared.`);
    res.json({ message: 'Report marked as clean successfully with evidence!', report: updatedReport });
  } catch (error) {
    console.error('Error in /report/:id/clear:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/report/:id/scan', upload.single('photo'), async (req, res) => {
  try {
    const reportId = req.params.id;
    console.log(`PUT /report/${reportId}/scan called`);
    if (!req.file) {
      console.log('No photo file provided.');
      return res.status(400).json({ error: 'No photo uploaded' });
    }
    console.log('Multer saved file as:', req.file.filename);
    const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    console.log('Local image URL:', imageUrl);
    const azureEndpoint =
      'https://litterwarden.cognitiveservices.azure.com/vision/v3.2/analyze?visualFeatures=Categories,Description,Tags';
    const bodyData = { url: imageUrl };
    console.log('Sending request to Azure Vision API at:', azureEndpoint);
    console.log('Request body:', JSON.stringify(bodyData));
    const azureResponse = await fetch(azureEndpoint, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': AZURE_VISION_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodyData),
    });
    console.log('Azure response status:', azureResponse.status);
    let recognizedLitter = 'Not Recognized';
    if (azureResponse.ok) {
      const analysisResult = await azureResponse.json();
      console.log('Azure Analysis Result:', JSON.stringify(analysisResult, null, 2));
      if (analysisResult.description?.captions?.length > 0) {
        recognizedLitter = analysisResult.description.captions[0].text;
      }
    } else {
      const errorText = await azureResponse.text();
      console.error('Azure API error:', errorText);
      recognizedLitter = 'Recognition error: ' + errorText;
    }
    console.log('Final recognizedLitter:', recognizedLitter);
    const updatedReport = await Report.findByIdAndUpdate(
      reportId,
      {
        evidence: recognizedLitter,
        imageUrl,
      },
      { new: true }
    );
    if (!updatedReport) {
      console.error('Report not found when updating scan.');
      return res.status(404).json({ error: 'Report not found' });
    }
    console.log('Updated Report (scan):', JSON.stringify(updatedReport, null, 2));
    res.json({ message: 'Image scanned successfully', report: updatedReport });
  } catch (error) {
    console.error('Error in /report/:id/scan:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/report/:id/photo', upload.single('photo'), async (req, res) => {
  try {
    const reportId = req.params.id;
    if (!req.file) {
      return res.status(400).json({ error: 'No photo uploaded' });
    }
    const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    const updatedReport = await Report.findByIdAndUpdate(
      reportId,
      { imageUrl },
      { new: true }
    );
    if (!updatedReport) {
      return res.status(404).json({ error: 'Report not found' });
    }
    res.json({ message: 'Photo evidence uploaded successfully!', report: updatedReport });
  } catch (error) {
    console.error('Error uploading photo evidence:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
