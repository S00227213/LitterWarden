require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer'); // Keep multer if you still use /report/upload for other things, otherwise it can be removed later
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const { URL } = require('url');
const s3Routes = require('./routes/s3'); // Make sure this path is correct
const app = express();
app.use(express.json());
app.use(cors());
app.use('/s3', s3Routes);

// Serve uploads folder (Only needed if using local uploads, can be removed if only using S3)
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  // fs.mkdirSync(uploadDir); // Comment out or remove if not using local storage
  // console.log(`Created uploads dir: ${uploadDir}`);
}
// app.use('/uploads', express.static(uploadDir)); // Comment out or remove if not using local storage
// console.log(`Serving ${uploadDir} at /uploads`);

// Env vars
const MONGO_URI = process.env.MONGO_URI;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const AZURE_CV_KEY = process.env.AZURE_CV_KEY;
const AZURE_CV_ENDPOINT = process.env.AZURE_CV_ENDPOINT;
// const NGROK_URL = process.env.NGROK_URL; // NGROK likely not needed for S3 flow

if (!MONGO_URI) { console.error("MONGO_URI missing."); process.exit(1); }
if (!GOOGLE_MAPS_API_KEY) { console.warn("GOOGLE_MAPS_API_KEY missing."); }
if (!AZURE_CV_KEY || !AZURE_CV_ENDPOINT) { console.warn("AZURE vars missing."); }
// if (!NGROK_URL) { console.warn("NGROK_URL missing."); } // NGROK likely not needed

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
  imageUrl: { type: String, trim: true, default: null }, // This will store the S3 URL
  recognizedCategory: { type: String, trim: true, default: 'Analysis Pending' },
  isClean: { type: Boolean, default: false, index: true },
});
const Report = mongoose.model('Report', reportSchema, 'reports');

// Server-side geocoding (Keep as is)
const getAddressFromCoordsServer = async (latitude, longitude) => {
  // ... (your existing geocoding code) ...
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

// Azure Computer Vision Analysis (Keep as is, will be called after S3 URL is saved)
const analyzeImageWithAzure = async (imageUrl) => {
  // ... (your existing Azure analysis code) ...
    if (!AZURE_CV_KEY || !AZURE_CV_ENDPOINT || !imageUrl) {
    console.warn('Skipping Azure analysis. Missing config or URL.');
    return 'Analysis Skipped'; // Return a clear status
  }
  // Ensure the URL is valid before sending
   try {
        new URL(imageUrl); // Validate URL format
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
      body: JSON.stringify({ url: imageUrl }), // Send the S3 URL
    });
    if (!response.ok) {
      const errBody = await response.text();
      console.error(`Azure Error: ${response.status}`, errBody);
       // Provide more detail if possible
      let failureReason = 'Analysis Failed';
      if (response.status === 400) failureReason = 'Analysis Failed - Bad Request (check URL/image format)';
      else if (response.status === 401) failureReason = 'Analysis Failed - Unauthorized (check Azure key)';
      else if (response.status === 404) failureReason = 'Analysis Failed - Not Found (check Azure endpoint)';
      return failureReason;
    }
    const data = await response.json();
    console.log('Azure Response:', JSON.stringify(data, null, 2)); // Log the full response for debugging
    let category = 'Analysis Done - Unknown Category'; // Default if logic below fails
    if (data.description?.captions?.length > 0) {
        category = data.description.captions[0].text; // Use description first
    }
    if (data.tags?.length > 0) {
         // Try finding specific keywords
        const relevantTag = data.tags.find(t => ['trash', 'waste', 'litter', 'garbage', 'pollution', 'dump', 'rubbish', 'plastic', 'bottle', 'can'].includes(t.name.toLowerCase()));
        if (relevantTag) {
             category = relevantTag.name.charAt(0).toUpperCase() + relevantTag.name.slice(1);
        } else if (category === 'Analysis Done - Unknown Category') {
            // Fallback to the highest confidence tag if no relevant keyword found and no description
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

// Multer config (Only needed if using local uploads, can be removed if only using S3)
// const storage = multer.diskStorage({ ... });
// const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// --- Report Routes ---

// POST /report (Keep as is)
app.post('/report', async (req, res) => {
  // ... (your existing POST /report code) ...
   try {
    let { latitude, longitude, town, county, country, priority, email } = req.body;
    if (typeof latitude !== 'number' || typeof longitude !== 'number' || !priority || !email) {
        console.error("POST /report - Missing/invalid fields:", req.body);
        return res.status(400).json({ error: 'Missing/invalid fields' });
    }
    if (!['low', 'medium', 'high'].includes(priority)) {
        console.error("POST /report - Invalid priority:", priority);
        return res.status(400).json({ error: 'Invalid priority.' });
    }
     // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        console.error("POST /report - Invalid email format:", email);
        return res.status(400).json({ error: 'Invalid email.' });
    }
    console.log('POST /report - Received Data:', req.body);

    // Check if geocoding needed from server
    const lookupFailed = !town || town === 'Unknown' || town.includes('Error') || town.includes('Failed') || town.includes('Skipped') ||
                         !county || county === 'Unknown' || county.includes('Error') || county.includes('Failed') || county.includes('Skipped') ||
                         !country || country === 'Unknown' || country.includes('Error') || country.includes('Failed') || country.includes('Skipped');

    if (lookupFailed) {
      console.log("POST /report - Client lookup incomplete/failed, using server geocode...");
      try {
          const locData = await getAddressFromCoordsServer(latitude, longitude);
          // Only overwrite if server lookup was successful
          if (locData.town && !locData.town.includes('Error') && !locData.town.includes('Failed') && !locData.town.includes('Skipped')) {
              town = locData.town;
          }
          if (locData.county && !locData.county.includes('Error') && !locData.county.includes('Failed') && !locData.county.includes('Skipped')) {
              county = locData.county;
          }
          if (locData.country && !locData.country.includes('Error') && !locData.country.includes('Failed') && !locData.country.includes('Skipped')) {
              country = locData.country;
          }
      } catch (geocodeError) {
          console.error("POST /report - Error during server-side geocoding:", geocodeError);
          // Proceed with potentially 'Unknown' values, don't stop the report
          town = town || 'Unknown';
          county = county || 'Unknown';
          country = country || 'Unknown';
      }
    }

    // Ensure defaults if still unknown after potential server lookup
    const reportToSave = {
        latitude,
        longitude,
        town: town || 'Unknown',
        county: county || 'Unknown',
        country: country || 'Unknown',
        priority,
        email: email.toLowerCase().trim() // Ensure lowercase and trimmed
    };

    console.log('POST /report - Saving Report to DB:', reportToSave);
    const newReport = await Report.create(reportToSave);
    console.log('POST /report - Report saved successfully:', newReport._id);
    res.status(201).json({ message: 'Report saved!', report: newReport });

  } catch (error) {
    console.error('POST /report - Save Report Error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: 'Validation Error', details: error.message });
    }
    res.status(500).json({ error: 'Internal server error while saving report.', details: error.message });
  }
});

// POST /report/upload (Keep or remove - this is the OLD local upload route)
// If you are ONLY using S3 uploads initiated by the client, you might not need this route anymore.
// Comment it out if you are sure the client ONLY uses PATCH /report/image/:id after S3 upload.
/*
app.post('/report/upload', upload.single('image'), async (req, res) => {
  // ... (your existing POST /report/upload code for local files) ...
  // This route uses NGROK_URL and saves files locally.
  // It conflicts with the S3 flow where the client uploads directly.
  console.warn("Deprecated POST /report/upload called. Should use S3 flow.");
  res.status(405).json({ error: "Method Not Allowed - Use S3 upload flow." });
});
*/

// GET /reports (Keep as is)
app.get('/reports', async (req, res) => {
  // ... (your existing GET /reports code) ...
    try {
    const { email, page = 1, limit = 50, includeClean = 'false' } = req.query;
    console.log(`GET /reports - Query params:`, req.query);
    const filter = {};
    if (email) {
        filter.email = email.toLowerCase(); // Ensure case-insensitive match
    }
    if (includeClean !== 'true') {
        filter.isClean = { $ne: true }; // Exclude clean reports by default
    }

    // Validate pagination parameters
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    if (isNaN(pageNum) || pageNum < 1 || isNaN(limitNum) || limitNum < 1 || limitNum > 200) { // Add upper limit
        console.error("GET /reports - Invalid page or limit:", { page, limit });
        return res.status(400).json({ error: 'Invalid page or limit parameters.' });
    }

    console.log("GET /reports - DB Filter:", filter);
    const reports = await Report.find(filter)
      .sort({ reportedAt: -1 }) // Sort by most recent first
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    console.log(`GET /reports - Found ${reports.length} reports.`);
    res.json(reports);
  } catch (error) {
    console.error('GET /reports - Fetch Reports Error:', error);
    res.status(500).json({ error: 'Error fetching reports.', details: error.message });
  }
});

// ************************************************************
// *** ADDED/MODIFIED ROUTE FOR S3 IMAGE URL UPDATE ***
// ************************************************************
// PATCH /report/image/:id - Update image URL after S3 upload AND trigger analysis
app.patch('/report/image/:id', async (req, res) => {
  const reportId = req.params.id;
  const { imageUrl } = req.body; // Get the S3 imageUrl sent from the app

  console.log(`--> Received PATCH request for report ${reportId} with imageUrl: ${imageUrl}`);

  if (!reportId || !mongoose.Types.ObjectId.isValid(reportId)) {
    console.error("PATCH /report/image - Invalid report ID:", reportId);
    return res.status(400).json({ error: 'Invalid report ID.' });
  }
  // Basic validation for the S3 URL format (can be improved)
  if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.startsWith('https://')) {
    console.error("PATCH /report/image - Missing or invalid S3 imageUrl in body for report:", reportId, "Body:", req.body);
    return res.status(400).json({ error: 'Missing or invalid S3 image URL in request body.' });
  }

  try {
    console.log(`PATCH /report/image - Step 1: Attempting to update report ${reportId} in database with S3 URL...`);

    // First, update the report with the image URL and set status to pending analysis
    let updatedReport = await Report.findByIdAndUpdate(
        reportId,
        { $set: { imageUrl: imageUrl, recognizedCategory: 'Analysis Pending...' } }, // Set status while analyzing
        { new: true } // Return the updated document
    );

    if (!updatedReport) {
        console.error(`PATCH /report/image - Report ${reportId} not found during initial update.`);
        return res.status(404).json({ error: 'Report not found.' });
    }

    console.log(`PATCH /report/image - Report ${reportId} URL updated. Step 2: Triggering Azure analysis...`);

    // Now, trigger the Azure analysis asynchronously (don't wait for it to finish before responding)
    analyzeImageWithAzure(imageUrl).then(async (analysisResult) => {
        console.log(`PATCH /report/image - Azure analysis completed for ${reportId}. Result: ${analysisResult}`);
        // Update the report again with the analysis result
        try {
            const finalUpdate = await Report.findByIdAndUpdate(
                reportId,
                { $set: { recognizedCategory: analysisResult } },
                { new: true }
            );
            if (finalUpdate) {
                console.log(`PATCH /report/image - Report ${reportId} updated with Azure result.`);
            } else {
                console.error(`PATCH /report/image - Report ${reportId} not found during final Azure update.`);
            }
        } catch (analysisUpdateError) {
            console.error(`PATCH /report/image - Error updating report ${reportId} with Azure result:`, analysisUpdateError);
        }
    }).catch(azureError => {
        // Catch errors specifically from the analyzeImageWithAzure promise chain
        console.error(`PATCH /report/image - Error during async Azure analysis call for ${reportId}:`, azureError);
         // Optionally update the status to reflect the analysis error
         Report.findByIdAndUpdate(reportId, { $set: { recognizedCategory: 'Analysis Failed' } }).exec();
    });

    console.log(`PATCH /report/image - Responding to client for report ${reportId} (Azure analysis runs in background).`);
    // Respond to the client immediately after the first update, don't wait for Azure
    res.json({ message: 'Report image URL saved, analysis started.', report: updatedReport });

  } catch (error) {
    console.error(`PATCH /report/image - Main error updating report ${reportId}:`, error);
    // Send back a JSON error response
    res.status(500).json({ error: 'Internal server error during report image update.', details: error.message });
  }
});
// ************************************************************
// ************************************************************


// PATCH /report/clean (Keep as is, but ensure it handles S3 deletion if needed - currently only handles local)
app.patch('/report/clean', async (req, res) => {
  // ... (your existing PATCH /report/clean code) ...
  // NOTE: This code currently tries to delete from the local 'uploads' folder.
  // If you ONLY use S3, you might want to add S3 object deletion here instead/as well.
  // This requires AWS SDK v3 DeleteObjectCommand. For now, leaving as is.
   try {
    const { reportId } = req.body;
    if (!reportId) return res.status(400).json({ error: 'Missing reportId.' });
    if (!mongoose.Types.ObjectId.isValid(reportId)) return res.status(400).json({ error: 'Invalid reportId.' });

    console.log(`PATCH /report/clean - Request for report: ${reportId}`);
    const reportToClean = await Report.findById(reportId);
    if (!reportToClean) return res.status(404).json({ error: 'Report not found.' });

    // Optional: Add S3 Deletion Logic Here if needed
    if (reportToClean.imageUrl && reportToClean.imageUrl.includes('s3.amazonaws.com')) {
        console.log(`PATCH /report/clean - Found S3 image URL: ${reportToClean.imageUrl}. Deletion logic can be added here.`);
        // TODO: Add S3 delete object command if required
        // Example (requires s3 client setup like in s3.js and DeleteObjectCommand):
        /*
        const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3'); // At top
        const s3 = new S3Client({ region: 'eu-west-1', credentials: {...} }); // Configured S3 client

        try {
            const parsedUrl = new URL(reportToClean.imageUrl);
            const key = decodeURIComponent(parsedUrl.pathname.substring(1)); // Remove leading '/' and decode
            console.log(`Attempting to delete S3 object: Bucket=${process.env.S3_BUCKET_NAME}, Key=${key}`);
            const deleteCommand = new DeleteObjectCommand({
                Bucket: process.env.S3_BUCKET_NAME,
                Key: key,
            });
            await s3.send(deleteCommand);
            console.log(`S3 object deleted successfully: ${key}`);
        } catch (s3DeleteError) {
            console.error(`Error deleting S3 object ${reportToClean.imageUrl}:`, s3DeleteError);
            // Decide if you should proceed or return an error
        }
        */
    } else if (reportToClean.imageUrl) {
        // Existing logic for local file deletion (if still relevant)
         console.log(`PATCH /report/clean - Found non-S3/local image URL: ${reportToClean.imageUrl}`);
         try {
            const parsedUrl = new URL(reportToClean.imageUrl); // May fail if not a full URL
            if (parsedUrl.protocol === 'file:' || reportToClean.imageUrl.startsWith('/uploads/')) { // Check if it looks like a local path/URL segment
                 const filename = path.basename(parsedUrl.pathname);
                 const filePath = path.join(uploadDir, filename);
                 if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    console.log(`Deleted local image file: ${filePath}`);
                 } else {
                    console.log(`Local image file not found for deletion: ${filePath}`);
                 }
            } else {
                 console.log("Image URL does not appear to be a local file path, skipping local delete.");
            }
         } catch (imgError) {
             console.error(`Error processing/deleting local image for ${reportId}:`, imgError);
         }
    }

    // Update report status
    const updatedReport = await Report.findByIdAndUpdate(
      reportId,
      { $set: { isClean: true, imageUrl: null, recognizedCategory: 'Cleaned' } }, // Remove image URL when cleaned
      { new: true }
    );
    console.log(`Report ${reportId} marked clean in DB.`);
    res.json({ message: 'Report marked clean!', report: updatedReport });
  } catch (error) {
    console.error('PATCH /report/clean - Error:', error);
    res.status(500).json({ error: 'Error marking report clean.', details: error.message });
  }
});

// DELETE /report/:id (Keep as is, consider S3 deletion)
app.delete('/report/:id', async (req, res) => {
  // ... (your existing DELETE /report/:id code) ...
  // NOTE: Similar to clean, consider adding S3 object deletion here too.
  // Leaving as is for now.
   try {
    const reportId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(reportId)) return res.status(400).json({ error: 'Invalid report ID.' });

    console.log(`DELETE /report/:id - Request for report: ${reportId}`);
    // Find before deleting to get the imageUrl for potential S3 cleanup
    const reportToDelete = await Report.findById(reportId);
    if (!reportToDelete) return res.status(404).json({ error: 'Report not found.' });

    // Optional: Add S3 Deletion Logic Here if needed
    if (reportToDelete.imageUrl && reportToDelete.imageUrl.includes('s3.amazonaws.com')) {
         console.log(`DELETE /report/:id - Found S3 image URL: ${reportToDelete.imageUrl}. Deletion logic can be added here.`);
         // TODO: Add S3 delete object command if required (similar to PATCH /report/clean)
    } else if (reportToDelete.imageUrl) {
        // Existing logic for local file deletion
        console.log(`DELETE /report/:id - Found non-S3/local image URL: ${reportToDelete.imageUrl}`);
        try {
            const parsedUrl = new URL(reportToDelete.imageUrl);
             if (parsedUrl.protocol === 'file:' || reportToDelete.imageUrl.startsWith('/uploads/')) {
                 const filename = path.basename(parsedUrl.pathname);
                 const filePath = path.join(uploadDir, filename);
                 if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    console.log(`Deleted associated local image file: ${filePath}`);
                 } else {
                    console.log(`Associated local image file not found for deletion: ${filePath}`);
                 }
             }
        } catch (imgError) {
             console.error(`Error processing/deleting associated local image for ${reportId}:`, imgError);
        }
    }

    // Now delete the report record
    await Report.findByIdAndDelete(reportId);
    console.log(`Report ${reportId} deleted from DB.`);
    res.json({ message: 'Report deleted successfully!', report: reportToDelete }); // Return the deleted report info

  } catch (error) {
    console.error('DELETE /report/:id - Error:', error);
    res.status(500).json({ error: 'Error deleting report.', details: error.message });
  }
});

// DELETE /report/image/:id (Keep as is, consider S3 deletion)
app.delete('/report/image/:id', async (req, res) => {
  // ... (your existing DELETE /report/image/:id code) ...
  // NOTE: Similar to clean, consider adding S3 object deletion here too.
  // Leaving as is for now.
   try {
    const reportId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(reportId)) return res.status(400).json({ error: 'Invalid report ID.' });

    console.log(`DELETE /report/image/:id - Request for report: ${reportId}`);
    const report = await Report.findById(reportId);
    if (!report) return res.status(404).json({ error: 'Report not found.' });
    if (!report.imageUrl) return res.status(400).json({ error: 'Report does not have an image to delete.' });

    // Optional: Add S3 Deletion Logic Here if needed
     if (report.imageUrl && report.imageUrl.includes('s3.amazonaws.com')) {
         console.log(`DELETE /report/image/:id - Found S3 image URL: ${report.imageUrl}. Deletion logic can be added here.`);
         // TODO: Add S3 delete object command if required (similar to PATCH /report/clean)
    } else {
        // Existing logic for local file deletion
        console.log(`DELETE /report/image/:id - Found non-S3/local image URL: ${report.imageUrl}`);
        try {
            const parsedUrl = new URL(report.imageUrl);
             if (parsedUrl.protocol === 'file:' || report.imageUrl.startsWith('/uploads/')) {
                 const filename = path.basename(parsedUrl.pathname);
                 const filePath = path.join(uploadDir, filename);
                 if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    console.log(`Deleted associated local image file: ${filePath}`);
                 } else {
                    console.log(`Associated local image file not found for deletion: ${filePath}`);
                 }
             }
        } catch (imgError) {
             console.error(`Error processing/deleting associated local image for ${reportId}:`, imgError);
        }
    }


    // Update the report record to remove the image URL
    const updatedReport = await Report.findByIdAndUpdate(
      reportId,
      { $set: { imageUrl: null, recognizedCategory: 'Analysis Pending' } }, // Reset image and category
      { new: true }
    );

    if (!updatedReport) {
      // This shouldn't happen if findById found it earlier, but good to check
       console.error(`DELETE /report/image/:id - Report ${reportId} not found during final update.`);
      return res.status(404).json({ error: 'Report not found after attempting image removal.' });
    }

    console.log(`Image cleared for report ${reportId} in DB.`);
    res.json({ message: 'Image removed successfully!', report: updatedReport });

  } catch (error) {
    console.error('DELETE /report/image/:id - Error:', error);
    // Handle potential CastError specifically if findById fails with invalid ID format
    if (error instanceof mongoose.Error.CastError) {
        return res.status(400).json({ error: 'Invalid report ID format.' });
    }
    res.status(500).json({ error: 'Error deleting report image.', details: error.message });
  }
});


// Root route (Keep as is)
app.get('/', (req, res) => {
  res.send('LitterWarden Server is running!');
});

// Start server (Keep as is)
const PORT = process.env.PORT || 10000; // Render typically uses 10000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));