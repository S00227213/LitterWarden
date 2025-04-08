require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const { URL } = require('url');
const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const s3Routes = require('./routes/s3');

const app = express();
app.use(express.json());
app.use(cors());
app.use('/s3', s3Routes);

// --- Environment Variables ---
const MONGO_URI = process.env.MONGO_URI;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const AZURE_CV_KEY = process.env.AZURE_CV_KEY;
const AZURE_CV_ENDPOINT = process.env.AZURE_CV_ENDPOINT;
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME;
const AWS_REGION = process.env.AWS_REGION;

// --- Validation ---
if (!MONGO_URI) { console.error("FATAL: MONGO_URI missing."); process.exit(1); }
if (!GOOGLE_MAPS_API_KEY) { console.warn("Warning: GOOGLE_MAPS_API_KEY missing."); }
if (!AZURE_CV_KEY || !AZURE_CV_ENDPOINT) { console.warn("Warning: AZURE vars missing."); }
if (!S3_BUCKET_NAME) { console.warn("Warning: S3_BUCKET_NAME missing."); }
if (!AWS_REGION) { console.warn("Warning: AWS_REGION missing."); }

// --- AWS S3 Client Setup ---
let s3Client;
if (AWS_REGION && S3_BUCKET_NAME) {
  s3Client = new S3Client({ region: AWS_REGION });
  console.log(`S3 Client configured for region: ${AWS_REGION}`);
} else {
  console.warn("S3 Client not configured due to missing AWS_REGION or S3_BUCKET_NAME.");
  s3Client = null;
}

// --- MongoDB Connection ---
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

// --- Mongoose Schema & Model ---
const reportSchema = new mongoose.Schema({
  latitude: { type: Number, required: true, index: true },
  longitude: { type: Number, required: true, index: true },
  town: { type: String, default: 'Unknown', trim: true },
  county: { type: String, default: 'Unknown', trim: true },
  country: { type: String, default: 'Unknown', trim: true },
  priority: { type: String, enum: ['low', 'medium', 'high'], required: true },
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  reportedAt: { type: Date, default: Date.now, index: true },
  imageUrl: { type: String, trim: true, default: null }, // S3 URL
  recognizedCategory: { type: String, trim: true, default: 'Analysis Pending' },
  isClean: { type: Boolean, default: false, index: true },
});
const Report = mongoose.model('Report', reportSchema, 'reports');

// --- Helper Functions ---

// Server-side Geocoding
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
    console.warn('Skipping Azure analysis. Missing config or URL.');
    return 'Analysis Skipped';
  }
   try {
        new URL(imageUrl);
    } catch (urlError) {
        console.error('Invalid URL provided for Azure analysis:', imageUrl, urlError);
        return 'Analysis Failed - Invalid URL';
    }

  console.log(`Analyzing image via Azure: ${imageUrl}`);
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
      let failureReason = 'Analysis Failed';
      if (response.status === 400) failureReason = 'Analysis Failed - Bad Request';
      else if (response.status === 401) failureReason = 'Analysis Failed - Unauthorized';
      else if (response.status === 404) failureReason = 'Analysis Failed - Not Found';
      return failureReason;
    }
    const data = await response.json();
    let category = 'Analysis Done - Unknown Category';
    if (data.description?.captions?.length > 0) {
        category = data.description.captions[0].text;
    }
    if (data.tags?.length > 0) {
        const relevantTag = data.tags.find(t => ['trash', 'waste', 'litter', 'garbage', 'pollution', 'dump', 'rubbish', 'plastic', 'bottle', 'can'].includes(t.name.toLowerCase()));
        if (relevantTag) {
             category = relevantTag.name.charAt(0).toUpperCase() + relevantTag.name.slice(1);
        } else if (category === 'Analysis Done - Unknown Category') {
            category = data.tags[0].name.charAt(0).toUpperCase() + data.tags[0].name.slice(1);
        }
    }
    console.log('Determined Category:', category);
    return category;
  } catch (error) {
    console.error('Azure API connection error:', error);
    return 'Analysis Error - Network Issue';
  }
};

// Function to delete S3 object
const deleteS3Object = async (imageUrl) => {
    if (!s3Client) {
        console.warn("S3 Client not available. Skipping S3 deletion.");
        return false;
    }
    if (!imageUrl || !(imageUrl.includes('s3.amazonaws.com') || imageUrl.includes(S3_BUCKET_NAME))) {
        console.log("Invalid S3 URL or bucket name missing. Skipping S3 deletion.");
        return false;
    }

    try {
        const parsedUrl = new URL(imageUrl);
        const key = decodeURIComponent(parsedUrl.pathname.substring(1));
        const bucket = S3_BUCKET_NAME;

        console.log(`Attempting to delete S3 object: Bucket=${bucket}, Key=${key}`);
        const deleteCommand = new DeleteObjectCommand({ Bucket: bucket, Key: key });
        await s3Client.send(deleteCommand);
        console.log(`S3 object deleted successfully: ${key}`);
        return true;
    } catch (s3DeleteError) {
        console.error(`Error deleting S3 object ${imageUrl}:`, s3DeleteError);
        return false;
    }
};

// --- API Routes ---

// POST /report: Create a new report
app.post('/report', async (req, res) => {
   try {
    let { latitude, longitude, town, county, country, priority, email } = req.body;
    if (typeof latitude !== 'number' || typeof longitude !== 'number' || !priority || !email || !['low', 'medium', 'high'].includes(priority) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Missing or invalid required fields.' });
    }

    const lookupFailed = !town || town === 'Unknown' || town.includes('Error') || town.includes('Failed') || town.includes('Skipped') ||
                         !county || county === 'Unknown' || county.includes('Error') || county.includes('Failed') || county.includes('Skipped') ||
                         !country || country === 'Unknown' || country.includes('Error') || country.includes('Failed') || country.includes('Skipped');

    if (lookupFailed) {
      console.log("Using server geocode...");
      try {
          const locData = await getAddressFromCoordsServer(latitude, longitude);
          if (locData.town && !locData.town.includes('Error') && !locData.town.includes('Failed') && !locData.town.includes('Skipped')) town = locData.town;
          if (locData.county && !locData.county.includes('Error') && !locData.county.includes('Failed') && !locData.county.includes('Skipped')) county = locData.county;
          if (locData.country && !locData.country.includes('Error') && !locData.country.includes('Failed') && !locData.country.includes('Skipped')) country = locData.country;
      } catch (geocodeError) {
          console.error("Server-side geocoding error:", geocodeError);
      }
    }

    const reportToSave = {
        latitude, longitude, priority,
        town: town || 'Unknown',
        county: county || 'Unknown',
        country: country || 'Unknown',
        email: email.toLowerCase().trim()
    };

    const newReport = await Report.create(reportToSave);
    console.log('Report saved:', newReport._id);
    res.status(201).json({ message: 'Report saved!', report: newReport });

  } catch (error) {
    console.error('POST /report error:', error);
    res.status(500).json({ error: 'Internal server error while saving report.', details: error.message });
  }
});

// GET /reports: Retrieve reports
app.get('/reports', async (req, res) => {
    try {
    const { email, page = 1, limit = 50, includeClean = 'false' } = req.query;
    const filter = {};
    if (email) filter.email = email.toLowerCase();
    if (includeClean !== 'true') filter.isClean = { $ne: true };

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    if (isNaN(pageNum) || pageNum < 1 || isNaN(limitNum) || limitNum < 1 || limitNum > 200) {
        return res.status(400).json({ error: 'Invalid page or limit parameters.' });
    }

    const reports = await Report.find(filter)
      .sort({ reportedAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    res.json(reports);
  } catch (error) {
    console.error('GET /reports error:', error);
    res.status(500).json({ error: 'Error fetching reports.', details: error.message });
  }
});

// PATCH /report/image/:id: Update report with image URL and trigger analysis
app.patch('/report/image/:id', async (req, res) => {
  const reportId = req.params.id;
  const { imageUrl } = req.body;

  if (!reportId || !mongoose.Types.ObjectId.isValid(reportId)) {
    return res.status(400).json({ error: 'Invalid report ID.' });
  }
  if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.startsWith('https://')) {
    return res.status(400).json({ error: 'Missing or invalid S3 image URL.' });
  }

  try {
    let updatedReport = await Report.findByIdAndUpdate(
        reportId,
        { $set: { imageUrl: imageUrl, recognizedCategory: 'Analysis Pending...' } },
        { new: true }
    );

    if (!updatedReport) {
        return res.status(404).json({ error: 'Report not found.' });
    }

    analyzeImageWithAzure(imageUrl).then(async (analysisResult) => {
        try {
            await Report.findByIdAndUpdate(reportId, { $set: { recognizedCategory: analysisResult } });
            console.log(`Azure analysis updated for ${reportId}`);
        } catch (analysisUpdateError) {
            console.error(`Error updating report ${reportId} with Azure result:`, analysisUpdateError);
        }
    }).catch(azureError => {
        console.error(`Async Azure analysis error for ${reportId}:`, azureError);
         Report.findByIdAndUpdate(reportId, { $set: { recognizedCategory: 'Analysis Failed' } }).exec();
    });

    res.json({ message: 'Report image URL saved, analysis started.', report: updatedReport });

  } catch (error) {
    console.error(`PATCH /report/image/:id error:`, error);
    res.status(500).json({ error: 'Internal server error.', details: error.message });
  }
});

// PATCH /report/clean: Mark a report as cleaned
app.patch('/report/clean', async (req, res) => {
   try {
    const { reportId } = req.body;
    if (!reportId || !mongoose.Types.ObjectId.isValid(reportId)) {
        return res.status(400).json({ error: 'Invalid or missing reportId.' });
    }

    const reportToClean = await Report.findById(reportId);
    if (!reportToClean) return res.status(404).json({ error: 'Report not found.' });

    if (reportToClean.imageUrl) {
        await deleteS3Object(reportToClean.imageUrl);
    }

    const updatedReport = await Report.findByIdAndUpdate(
      reportId,
      { $set: { isClean: true, imageUrl: null, recognizedCategory: 'Cleaned' } },
      { new: true }
    );
    console.log(`Report ${reportId} marked clean.`);
    res.json({ message: 'Report marked clean!', report: updatedReport });
  } catch (error) {
    console.error('PATCH /report/clean error:', error);
    res.status(500).json({ error: 'Error marking report clean.', details: error.message });
  }
});

// DELETE /report/:id: Delete a report entirely
app.delete('/report/:id', async (req, res) => {
   try {
    const reportId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(reportId)) return res.status(400).json({ error: 'Invalid report ID.' });

    const reportToDelete = await Report.findById(reportId);
    if (!reportToDelete) return res.status(404).json({ error: 'Report not found.' });

    if (reportToDelete.imageUrl) {
        await deleteS3Object(reportToDelete.imageUrl);
    }

    await Report.findByIdAndDelete(reportId);
    console.log(`Report ${reportId} deleted.`);
    res.json({ message: 'Report deleted successfully!', report: reportToDelete });

  } catch (error) {
    console.error('DELETE /report/:id error:', error);
    res.status(500).json({ error: 'Error deleting report.', details: error.message });
  }
});

// DELETE /report/image/:id: Delete ONLY the image
app.delete('/report/image/:id', async (req, res) => {
   try {
    const reportId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(reportId)) {
        return res.status(400).json({ error: 'Invalid report ID format.' });
    }

    const report = await Report.findById(reportId);
    if (!report) {
        return res.status(404).json({ error: 'Report not found.' });
    }
    if (!report.imageUrl) {
        return res.status(400).json({ error: 'Report does not have an image to delete.' });
    }

    const s3DeletionSuccess = await deleteS3Object(report.imageUrl);

    if (!s3DeletionSuccess) {
        console.warn(`S3 deletion failed or skipped for ${report.imageUrl}, proceeding to update DB.`);
    }

    const updatedReport = await Report.findByIdAndUpdate(
      reportId,
      { $set: { imageUrl: null, recognizedCategory: 'Analysis Pending' } },
      { new: true }
    );

    if (!updatedReport) {
      return res.status(404).json({ error: 'Report not found during database update.' });
    }

    console.log(`Image URL cleared for report ${reportId}.`);
    res.json({ message: 'Image removed successfully!', report: updatedReport });

  } catch (error) {
    console.error('DELETE /report/image/:id error:', error);
    res.status(500).json({ error: 'Internal server error while deleting report image.', details: error.message });
  }
});

// --- Root Route ---
app.get('/', (req, res) => {
  res.send('LitterWarden Server is running!');
});

// --- Start Server ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));