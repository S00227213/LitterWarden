require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const fetch = require('node-fetch');
const { URL } = require('url');
const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const admin = require('firebase-admin'); // Import Firebase Admin
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
  FIREBASE_SERVICE_ACCOUNT_KEY_PATH, // Env var for Firebase Admin key
  PORT = 10000
} = process.env;

// --- Firebase Admin Initialization ---
if (!admin.apps.length && FIREBASE_SERVICE_ACCOUNT_KEY_PATH) {
  try {
    const serviceAccount = require(FIREBASE_SERVICE_ACCOUNT_KEY_PATH);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('Firebase Admin SDK Initialized Successfully.');
  } catch (error) {
    console.error("Error initializing Firebase Admin SDK:", error);
    console.error("Push notifications will NOT be sent.");
  }
} else if (!FIREBASE_SERVICE_ACCOUNT_KEY_PATH) {
    console.warn("Warning: FIREBASE_SERVICE_ACCOUNT_KEY_PATH not set. Push notifications disabled.");
}


if (!MONGO_URI) {
  console.error("FATAL ERROR: MONGO_URI environment variable is not set.");
  process.exit(1);
}
if (!GOOGLE_MAPS_API_KEY) console.warn("Warning: GOOGLE_MAPS_API_KEY is not set. Geocoding fallback may fail.");
if (!AZURE_CV_KEY || !AZURE_CV_ENDPOINT) console.warn("Warning: AZURE_CV_KEY or AZURE_CV_ENDPOINT is not set. Image analysis will be skipped.");
if (!S3_BUCKET_NAME) console.warn("Warning: S3_BUCKET_NAME is not set. S3 operations might fail.");
if (!AWS_REGION) console.warn("Warning: AWS_REGION is not set.");
if (!AWS_ACCESS_KEY_ID) console.warn("Warning: AWS_ACCESS_KEY_ID is not set.");
if (!AWS_SECRET_ACCESS_KEY) console.warn("Warning: AWS_SECRET_ACCESS_KEY is not set.");


let s3Client;
if (AWS_REGION && AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY && S3_BUCKET_NAME) {
  try {
    s3Client = new S3Client({
      region: AWS_REGION,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
      }
    });
    console.log(`S3 Client configured successfully for region: ${AWS_REGION}`);
  } catch (error) {
    console.error("Error configuring S3 Client:", error);
    s3Client = null;
  }
} else {
  console.warn("S3 Client not configured due to missing AWS credentials or S3_BUCKET_NAME.");
  s3Client = null;
}

mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB Connected Successfully'))
  .catch(err => {
    console.error('MongoDB Connection Error:', err.message || err);
    process.exit(1);
  });

const reportSchema = new mongoose.Schema({
  latitude:         { type: Number, required: true, index: true },
  longitude:        { type: Number, required: true, index: true },
  town:             { type: String, default: 'Unknown', trim: true },
  county:           { type: String, default: 'Unknown', trim: true },
  country:          { type: String, default: 'Unknown', trim: true },
  priority:         { type: String, enum: ['low', 'medium', 'high'], required: true, index: true },
  email:            { type: String, required: true, lowercase: true, trim: true, index: true },
  reportedAt:       { type: Date, default: Date.now, index: true },
  imageUrl:         { type: String, default: null, trim: true },
  recognizedCategory:{ type: String, default: 'Analysis Pending', trim: true },
  isClean:          { type: Boolean, default: false, index: true },
});
const Report = mongoose.model('Report', reportSchema, 'reports');

// --- ADD User Schema for storing FCM Tokens ---
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  // Add other user fields if needed (e.g., password hash if managing users here)
  fcmTokens: [{ type: String }] // Array to store FCM device tokens
});
const User = mongoose.model('User', userSchema); // Use 'User' model name


async function getAddressFromCoordsServer(latitude, longitude) {
  if (!GOOGLE_MAPS_API_KEY) {
    console.warn("Skipping server-side geocoding: GOOGLE_MAPS_API_KEY not set.");
    return { town: 'Skipped', county: 'Skipped', country: 'Skipped' };
  }
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`;
  try {
    const resp = await fetch(url);
    const data = await resp.json();
    if (data.status === 'OK' && data.results?.[0]?.address_components) {
      let town, county, country;
      for (const component of data.results[0].address_components) {
        if (component.types.includes('locality')) town = component.long_name;
        else if (component.types.includes('postal_town') && !town) town = component.long_name;
        else if (component.types.includes('administrative_area_level_2')) county = component.long_name;
        else if (component.types.includes('administrative_area_level_1') && !county) county = component.long_name;
        else if (component.types.includes('country')) country = component.long_name;
      }
      return {
        town: town || 'Unknown',
        county: county || 'Unknown',
        country: country || 'Unknown'
      };
    } else {
      console.warn(`Geocoding API status: ${data.status}`, data.error_message || '');
      return { town: 'Lookup Failed', county: 'Lookup Failed', country: 'Lookup Failed' };
    }
  } catch (e) {
    console.error('Server-side geocoding fetch error:', e);
    return { town: 'Geocode Error', county: 'Geocode Error', country: 'Geocode Error' };
  }
}

async function analyzeImageWithAzure(imageUrl) {
  if (!AZURE_CV_KEY || !AZURE_CV_ENDPOINT) {
    console.warn("Skipping Azure analysis: Credentials not set.");
    return 'Analysis Skipped';
  }
  if (!imageUrl) return 'Analysis Skipped - No URL';
  try {
    new URL(imageUrl);
  } catch {
    console.warn("Skipping Azure analysis: Invalid image URL format:", imageUrl);
    return 'Analysis Failed - Invalid URL';
  }

  const requestUrl = `${AZURE_CV_ENDPOINT.replace(/\/$/, '')}/computervision/imageanalysis:analyze?api-version=2023-02-01-preview&features=tags,caption`;

  try {
    const resp = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': AZURE_CV_KEY
      },
      body: JSON.stringify({ url: imageUrl })
    });

    const responseBody = await resp.text();
    if (!resp.ok) {
      console.error(`Azure API error ${resp.status}:`, responseBody);
      return `Analysis Failed (${resp.status})`;
    }

    const data = JSON.parse(responseBody);
    const relevantTags = ['trash', 'waste', 'litter', 'garbage', 'pollution', 'dump', 'rubbish', 'plastic', 'bottle', 'can', 'debris'];
    const foundTag = data.tagsResult?.values?.find(tag => relevantTags.includes(tag.name.toLowerCase()));

    if (foundTag) {
        return foundTag.name.charAt(0).toUpperCase() + foundTag.name.slice(1);
    } else if (data.captionResult?.text) {
        return data.captionResult.text;
    } else if (data.tagsResult?.values?.length) {
        return data.tagsResult.values[0].name.charAt(0).toUpperCase() + data.tagsResult.values[0].name.slice(1);
    } else {
        return 'Analysis Complete - No Category';
    }
  } catch (e) {
    console.error('Azure analysis request error:', e);
    return 'Analysis Network Error';
  }
}

async function deleteS3Object(imageUrl) {
  if (!s3Client) {
    console.warn("Skipping S3 delete: S3 client not configured.");
    return false;
  }
  let key = '';
  const urlPrefixes = [
    `https://${S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/`,
    `https://s3.${AWS_REGION}.amazonaws.com/${S3_BUCKET_NAME}/`,
  ];

  for (const prefix of urlPrefixes) {
    if (imageUrl.startsWith(prefix)) {
      key = decodeURIComponent(imageUrl.substring(prefix.length));
      break;
    }
  }

  if (!key) {
    console.warn('Could not extract S3 key from URL, skipping delete:', imageUrl);
    return false;
  }

  try {
    const command = new DeleteObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: key,
    });
    await s3Client.send(command);
    console.log('Successfully deleted S3 object:', key);
    return true;
  } catch (e) {
    console.error(`Error deleting S3 object '${key}':`, e);
    return false;
  }
}

// --- ADD Endpoint to receive FCM tokens ---
app.post('/users/fcm-token', async (req, res) => {
  const { email, token } = req.body;
  if (!email || !token) {
    return res.status(400).json({ error: 'Missing email or token' });
  }
  try {
    const updatedUser = await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      { $addToSet: { fcmTokens: token } },
      // { new: true, upsert: true } // Use upsert: true if you want to create user if not found
      { new: true, upsert: false } // Assuming users are created via registration/login
    );

    if (!updatedUser) {
        // This might happen if the user record doesn't exist yet or uses a different ID system
        console.warn(`User not found to update FCM token: ${email}. Ensure user exists.`);
        return res.status(404).json({ error: 'User not found' });
    }

    console.log(`Stored/Updated FCM token for ${email}`);
    res.status(200).json({ message: 'Token stored successfully' });
  } catch (error) {
    console.error(`Error storing FCM token for ${email}:`, error);
    res.status(500).json({ error: 'Server error storing token' });
  }
});


app.post('/report', async (req, res) => {
  try {
    let { latitude, longitude, town, county, country, priority, email, imageUrl } = req.body;

    if (typeof latitude !== 'number' || typeof longitude !== 'number' ||
        !['low', 'medium', 'high'].includes(priority) || typeof email !== 'string' ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid input data provided.' });
    }

    const needGeocode = !town || town.includes('Error') || !county || county.includes('Error') || !country || country.includes('Error');
    if (needGeocode) {
      console.log(`Performing server-side geocode for ${latitude}, ${longitude}`);
      const addr = await getAddressFromCoordsServer(latitude, longitude);
      town = town && !town.includes('Error') ? town : addr.town;
      county = county && !county.includes('Error') ? county : addr.county;
      country = country && !country.includes('Error') ? country : addr.country;
    }

    let analysisResult = 'Analysis Pending';
    if (imageUrl && typeof imageUrl === 'string') {
        console.log(`Performing image analysis for: ${imageUrl}`);
        analysisResult = await analyzeImageWithAzure(imageUrl);
    } else {
        imageUrl = null;
    }

    const newReport = new Report({
      latitude,
      longitude,
      priority,
      email: email.toLowerCase().trim(),
      town: town || 'Unknown',
      county: county || 'Unknown',
      country: country || 'Unknown',
      imageUrl: imageUrl,
      recognizedCategory: analysisResult,
      reportedAt: new Date()
    });

    await newReport.save();
    console.log('New report saved:', newReport._id);
    res.status(201).json({ message: 'Report saved successfully', report: newReport });

  } catch (e) {
    console.error('Error in POST /report:', e);
    res.status(500).json({ error: 'Server error while saving the report.' });
  }
});

app.get('/reports', async (req, res) => {
  console.log('GET /reports request received with query:', req.query);
  try {
    const { email, page = 1, limit = 1000, includeClean = 'false' } = req.query; // Increase default limit for cleaner maybe
    const filter = {};
    if (email) {
      filter.email = String(email).toLowerCase();
    }
    if (String(includeClean).toLowerCase() !== 'true') {
      filter.isClean = { $ne: true };
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(5000, Math.max(1, parseInt(limit, 10) || 1000)); // Allow larger limit
    const skip = (pageNum - 1) * limitNum;

    console.log('Finding reports with filter:', filter, `Page: ${pageNum}, Limit: ${limitNum}, Skip: ${skip}`);

    const reports = await Report.find(filter)
                                .sort({ reportedAt: -1 }) // Default sort
                                .skip(skip)
                                .limit(limitNum);

    console.log(`Found ${reports.length} reports.`);
    res.status(200).json(reports);

  } catch (e) {
    console.error('Error in GET /reports:', e);
    res.status(500).json({ error: 'Server error while fetching reports.' });
  }
});

app.patch('/report/image/:id', async (req, res) => {
  const { id } = req.params;
  const { imageUrl } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Invalid report ID format.' });
  }
  if (typeof imageUrl !== 'string' || !imageUrl.trim()) {
    return res.status(400).json({ error: 'Invalid image URL provided.' });
  }

  try {
    const report = await Report.findById(id);
    if (!report) {
      return res.status(404).json({ error: 'Report not found.' });
    }
    if (report.imageUrl && report.imageUrl !== imageUrl) {
        console.log(`Deleting old S3 image for report ${id}: ${report.imageUrl}`);
        await deleteS3Object(report.imageUrl);
    }

    console.log(`Analyzing new image for report ${id}: ${imageUrl}`);
    const analysisResult = await analyzeImageWithAzure(imageUrl);

    const updatedReport = await Report.findByIdAndUpdate(id, {
      imageUrl: imageUrl,
      recognizedCategory: analysisResult
    }, { new: true });

    console.log(`Image updated for report ${id}.`);
    res.status(200).json({ message: 'Report image updated successfully', report: updatedReport });

  } catch (e) {
    console.error(`Error in PATCH /report/image/${id}:`, e);
    res.status(500).json({ error: 'Server error while updating report image.' });
  }
});

// --- MODIFIED /report/clean endpoint ---
app.patch('/report/clean', async (req, res) => {
  const { reportId } = req.body;
  if (!mongoose.Types.ObjectId.isValid(reportId)) {
    return res.status(400).json({ error: 'Invalid report ID format.' });
  }

  try {
    const reportToClean = await Report.findById(reportId);
    if (!reportToClean) {
      return res.status(404).json({ error: 'Report not found.' });
    }
    if (reportToClean.isClean) {
        return res.status(200).json({ message: 'Report already marked as clean.', report: reportToClean });
    }

    const reporterEmail = reportToClean.email; // Get email before update

    if (reportToClean.imageUrl) {
      console.log(`Deleting S3 image for cleaned report ${reportId}: ${reportToClean.imageUrl}`);
      await deleteS3Object(reportToClean.imageUrl);
    }

    const updatedReport = await Report.findByIdAndUpdate(reportId, {
      isClean: true,
      imageUrl: null,
      recognizedCategory: 'Cleaned'
    }, { new: true });

    console.log(`Report ${reportId} marked as clean.`);

    // --- Send FCM Notification ---
    if (reporterEmail && admin.apps.length > 0) { // Check if admin SDK is ready
        try {
            const reportingUser = await User.findOne({ email: reporterEmail.toLowerCase() });
            if (reportingUser && reportingUser.fcmTokens && reportingUser.fcmTokens.length > 0) {
                const tokens = reportingUser.fcmTokens;
                const messagePayload = {
                    data: { // Use data payload for foreground handling
                        type: 'REPORT_CLEANED',
                        reportId: reportId.toString(),
                        reportTown: reportToClean.town || 'your reported location',
                    },
                    // Optional notification payload for OS handling
                    // notification: {
                    //   title: 'Report Cleaned!',
                    //   body: `Your report near ${reportToClean.town || 'location'} was cleaned.`
                    // }
                };

                console.log(`Sending REPORT_CLEANED notification to ${reporterEmail}`);
                const response = await admin.messaging().sendToDevice(tokens, messagePayload, { priority: "high" });
                console.log('FCM send response received.'); // Don't log full response unless debugging tokens

                // Optional: Handle token cleanup based on response
                const tokensToRemove = [];
                response.results.forEach((result, index) => {
                    if (result.error) {
                        console.error('FCM send failure:', result.error.code, 'for token index:', index);
                        if (['messaging/invalid-registration-token', 'messaging/registration-token-not-registered'].includes(result.error.code)) {
                            tokensToRemove.push(tokens[index]);
                        }
                    }
                });
                if (tokensToRemove.length > 0) {
                    console.log("Attempting to remove invalid FCM tokens:", tokensToRemove.length);
                    await User.updateOne( { _id: reportingUser._id }, { $pullAll: { fcmTokens: tokensToRemove } } );
                }
            } else {
                console.warn(`Could not find user or FCM tokens for ${reporterEmail} to send clean notification.`);
            }
        } catch (fcmError) {
            console.error(`Failed to send FCM notification for report ${reportId}:`, fcmError);
        }
    }
    // --- End FCM Notification ---

    res.status(200).json({ message: 'Report marked as clean successfully', report: updatedReport });

  } catch (e) {
    console.error(`Error in PATCH /report/clean for ID ${reportId}:`, e);
    res.status(500).json({ error: 'Server error while marking report as clean.' });
  }
});


app.delete('/report/:id', async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Invalid report ID format.' });
  }

  try {
    const report = await Report.findById(id);
    if (!report) {
      return res.status(404).json({ error: 'Report not found.' });
    }

    if (report.imageUrl) {
      console.log(`Deleting S3 image for deleted report ${id}: ${report.imageUrl}`);
      await deleteS3Object(report.imageUrl);
    }

    await Report.findByIdAndDelete(id);
    console.log(`Report ${id} deleted successfully.`);
    res.status(200).json({ message: 'Report deleted successfully', reportId: id });

  } catch (e) {
    console.error(`Error in DELETE /report/${id}:`, e);
    res.status(500).json({ error: 'Server error while deleting the report.' });
  }
});

app.delete('/report/image/:id', async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Invalid report ID format.' });
  }

  try {
    const report = await Report.findById(id);
    if (!report) {
      return res.status(404).json({ error: 'Report not found.' });
    }
    if (!report.imageUrl) {
      return res.status(400).json({ error: 'Report does not have an image to delete.' });
    }

    console.log(`Deleting S3 image explicitly for report ${id}: ${report.imageUrl}`);
    await deleteS3Object(report.imageUrl);

    const updatedReport = await Report.findByIdAndUpdate(id, {
      imageUrl: null,
      recognizedCategory: 'Analysis Pending'
    }, { new: true });

    console.log(`Image removed for report ${id}.`);
    res.status(200).json({ message: 'Report image removed successfully', report: updatedReport });

  } catch (e) {
    console.error(`Error in DELETE /report/image/${id}:`, e);
    res.status(500).json({ error: 'Server error while removing report image.' });
  }
});

app.get('/leaderboard', async (req, res) => {
  console.log('GET /leaderboard request received');
  try {
    const leaderboard = await Report.aggregate([
      { $match: { isClean: { $ne: true } } },
      {
        $group: {
          _id: "$email",
          totalReports: { $sum: 1 },
          highPriority: { $sum: { $cond: [{ $eq: ["$priority", "high"] }, 1, 0] } },
          mediumPriority: { $sum: { $cond: [{ $eq: ["$priority", "medium"] }, 1, 0] } },
          lowPriority: { $sum: { $cond: [{ $eq: ["$priority", "low"] }, 1, 0] } }
        }
      },
      { $sort: { totalReports: -1 } },
      { $limit: 100 },
      {
        $project: {
          _id: 0, email: "$_id", totalReports: 1, highPriority: 1, mediumPriority: 1, lowPriority: 1
        }
      }
    ]);

    console.log(`Leaderboard generated with ${leaderboard.length} entries.`);
    res.status(200).json(leaderboard);

  } catch (e) {
    console.error('Error in GET /leaderboard:', e);
    res.status(500).json({ error: 'Server error while generating the leaderboard.' });
  }
});

app.get('/', (req, res) => {
  res.status(200).send('LitterWarden Server is running!');
});

app.use((req, res, next) => {
  console.warn(`404 Not Found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});