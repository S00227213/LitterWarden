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

const MONGO_URI = process.env.MONGO_URI;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const AZURE_CV_KEY = process.env.AZURE_CV_KEY;
const AZURE_CV_ENDPOINT = process.env.AZURE_CV_ENDPOINT;
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME;
const AWS_REGION = process.env.AWS_REGION;
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;

if (!MONGO_URI) { console.error("FATAL: MONGO_URI missing."); process.exit(1); }
if (!GOOGLE_MAPS_API_KEY) { console.warn("Warning: GOOGLE_MAPS_API_KEY missing."); }
if (!AZURE_CV_KEY || !AZURE_CV_ENDPOINT) { console.warn("Warning: AZURE vars missing."); }
if (!S3_BUCKET_NAME) { console.warn("Warning: S3_BUCKET_NAME missing."); }
if (!AWS_REGION) { console.warn("Warning: AWS_REGION missing."); }
if (!AWS_ACCESS_KEY_ID) { console.warn("Warning: AWS_ACCESS_KEY_ID missing."); }
if (!AWS_SECRET_ACCESS_KEY) { console.warn("Warning: AWS_SECRET_ACCESS_KEY missing."); }


let s3Client;
if (AWS_REGION && S3_BUCKET_NAME && AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY) {
  s3Client = new S3Client({
    region: AWS_REGION,
    credentials: {
       accessKeyId: AWS_ACCESS_KEY_ID,
       secretAccessKey: AWS_SECRET_ACCESS_KEY,
    }
  });
  console.log(`S3 Client configured for region: ${AWS_REGION}`);
} else {
  console.warn("S3 Client not configured due to missing AWS config (Region, Bucket, AccessKey, or SecretKey).");
  s3Client = null;
}


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


const deleteS3Object = async (imageUrl) => {
    if (!s3Client) {
        console.warn("S3 Client not available. Skipping S3 deletion.");
        return false;
    }

    let key = '';
    try {
        const s3UrlPattern1 = `https://${S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/`;
        const s3UrlPattern2 = `https://s3.${AWS_REGION}.amazonaws.com/${S3_BUCKET_NAME}/`;

        if (imageUrl && typeof imageUrl === 'string') {
            if (imageUrl.startsWith(s3UrlPattern1)) {
                key = decodeURIComponent(imageUrl.substring(s3UrlPattern1.length));
            } else if (imageUrl.startsWith(s3UrlPattern2)) {
                 key = decodeURIComponent(imageUrl.substring(s3UrlPattern2.length));
            }
        }

        if (!key) {
            console.log(`URL "${imageUrl}" does not appear to be a valid S3 URL for bucket ${S3_BUCKET_NAME} in region ${AWS_REGION}. Skipping S3 deletion.`);
            return false;
        }

        const bucket = S3_BUCKET_NAME;
        console.log(`Attempting to delete S3 object: Bucket=${bucket}, Key=${key}`);
        const deleteCommand = new DeleteObjectCommand({ Bucket: bucket, Key: key });
        await s3Client.send(deleteCommand);
        console.log(`S3 object deleted successfully: ${key}`);
        return true;
    } catch (s3DeleteError) {
        console.error(`Error deleting S3 object ${imageUrl} (Key: ${key}):`, s3DeleteError);
        return false;
    }
};


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


app.get('/reports', async (req, res) => {
    try {
    const { email, page = 1, limit = 50, includeClean = 'false' } = req.query;
    const filter = {};
    if (email) filter.email = email.toLowerCase();
    if (includeClean !== 'true') filter.isClean = { $ne: true };

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    const MAX_LIMIT = 1000;
    if (isNaN(pageNum) || pageNum < 1 || isNaN(limitNum) || limitNum < 1 || limitNum > MAX_LIMIT) {
        console.error(`GET /reports - Invalid page or limit (Max Limit: ${MAX_LIMIT}):`, { page, limit });
        return res.status(400).json({ error: `Invalid page or limit parameters (limit must be 1-${MAX_LIMIT}).` });
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

app.patch('/report/image/:id', async (req, res) => {
  const reportId = req.params.id;
  const { imageUrl } = req.body;

  console.log(`--> Received PATCH request for report ${reportId} with imageUrl: ${imageUrl}`);

  if (!reportId || !mongoose.Types.ObjectId.isValid(reportId)) {
    console.error("PATCH /report/image - Invalid report ID:", reportId);
    return res.status(400).json({ error: 'Invalid report ID.' });
  }
  if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.startsWith('https://')) {
    console.error("PATCH /report/image - Missing or invalid S3 imageUrl in body for report:", reportId, "Body:", req.body);
    return res.status(400).json({ error: 'Missing or invalid S3 image URL in request body.' });
  }

  try {

    const reportExists = await Report.findById(reportId);
    if (!reportExists) {
         console.error(`PATCH /report/image - Report ${reportId} not found.`);
         return res.status(404).json({ error: 'Report not found.' });
    }

    console.log(`PATCH /report/image - Report ${reportId} found. Step 2: Triggering Azure analysis for URL: ${imageUrl}`);


    const analysisResult = await analyzeImageWithAzure(imageUrl);
    console.log(`PATCH /report/image - Azure analysis completed for ${reportId}. Result: ${analysisResult}`);


     console.log(`PATCH /report/image - Step 3: Updating DB for ${reportId} with URL and Azure result...`);
    const updatedReport = await Report.findByIdAndUpdate(
        reportId,
        { $set: { imageUrl: imageUrl, recognizedCategory: analysisResult } },
        { new: true }
    );

    if (!updatedReport) {
        console.error(`PATCH /report/image - Report ${reportId} not found during final update.`);
        return res.status(404).json({ error: 'Report not found during final update after analysis.' });
    }

    console.log(`PATCH /report/image - Report ${reportId} fully updated.`);
    res.json({ message: 'Report image saved and analyzed!', report: updatedReport });

  } catch (error) {
    console.error(`PATCH /report/image - Error processing report ${reportId}:`, error);
    if (error.message.includes('Azure') || error.message.includes('Analysis')) {
        await Report.findByIdAndUpdate(reportId, { $set: { recognizedCategory: 'Analysis Error' } }).exec();
    }
    res.status(500).json({ error: 'Internal server error during report image processing.', details: error.message });
  }
});


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


app.delete('/report/image/:id', async (req, res) => {
   try {
    const reportId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(reportId)) {
        return res.status(400).json({ error: 'Invalid report ID format.' });
    }
    console.log(`DELETE /report/image/:id - Request for report: ${reportId}`);

    const report = await Report.findById(reportId);
    if (!report) {
        console.log(`DELETE /report/image/:id - Report ${reportId} not found.`);
        return res.status(404).json({ error: 'Report not found.' });
    }
    if (!report.imageUrl) {
        console.log(`DELETE /report/image/:id - Report ${reportId} has no image URL.`);
        return res.status(400).json({ error: 'Report does not have an image to delete.' });
    }

    console.log(`DELETE /report/image/:id - Attempting S3 deletion for URL: ${report.imageUrl}`);
    const s3DeletionSuccess = await deleteS3Object(report.imageUrl);

    if (s3DeletionSuccess) {
         console.log(`DELETE /report/image/:id - S3 object potentially deleted for ${report.imageUrl}.`);
    } else {
        console.warn(`DELETE /report/image/:id - S3 deletion failed or was skipped for ${report.imageUrl}. Proceeding to update DB.`);
    }


    console.log(`DELETE /report/image/:id - Updating DB for report ${reportId} to remove image URL.`);
    const updatedReport = await Report.findByIdAndUpdate(
      reportId,
      { $set: { imageUrl: null, recognizedCategory: 'Analysis Pending' } },
      { new: true }
    );

    if (!updatedReport) {

      console.error(`DELETE /report/image/:id - Report ${reportId} not found during final DB update.`);
      return res.status(404).json({ error: 'Report found initially but failed during database update.' });
    }

    console.log(`Image URL cleared from DB for report ${reportId}.`);
    res.json({ message: 'Image removed successfully!', report: updatedReport });

  } catch (error) {
    console.error('DELETE /report/image/:id - Unexpected error:', error);
    res.status(500).json({ error: 'Internal server error while deleting report image.', details: error.message });
  }
});


app.get('/', (req, res) => {
  res.send('LitterWarden Server is running!');
});


const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));