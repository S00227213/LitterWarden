require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
// No need to require node-fetch; using built-in fetch in Node.js v18+

const app = express();
app.use(express.json());
app.use(cors());

// **🔹 Connect to MongoDB**
const connectDB = async () => {
  try {
    // Removed the deprecated useNewUrlParser option
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB Connected');
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error);
    process.exit(1);
  }
};
connectDB();

// **🔹 Load Google Maps API Key**
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// **🔹 Mongoose Schema & Model**
const reportSchema = new mongoose.Schema({
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  town: { type: String, default: 'Unknown' },
  county: { type: String, default: 'Unknown' },
  country: { type: String, default: 'Unknown' },
  priority: { type: String, enum: ['low', 'medium', 'high'], required: true },
  email: { type: String, required: true, match: /.+\@.+\..+/ },
  reportedAt: { type: Date, default: Date.now },
});

const Report = mongoose.model('Report', reportSchema, 'reports');

// **🔹 Get Address from Coordinates using Google Maps API**
const getAddressFromCoords = async (latitude, longitude) => {
  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`
    );
    const data = await response.json();

    if (data.status === 'OK' && data.results.length > 0) {
      let town = 'Unknown',
        county = 'Unknown',
        country = 'Unknown';

      data.results[0].address_components.forEach((component) => {
        if (component.types.includes('locality')) town = component.long_name;
        if (component.types.includes('administrative_area_level_2')) county = component.long_name;
        if (component.types.includes('country')) country = component.long_name;
      });

      return { town, county, country };
    }
  } catch (error) {
    console.error('❌ Error fetching address:', error);
  }
  return { town: 'Unknown', county: 'Unknown', country: 'Unknown' };
};

// **🔹 POST /report - Save a New Litter Report**
app.post('/report', async (req, res) => {
  try {
    let { latitude, longitude, town, county, country, priority, email } = req.body;
    if (!latitude || !longitude || !priority || !email) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // If any address field is missing or unknown, fetch from Google Maps API
    if (!town || !county || !country || county === 'Unknown') {
      const locationData = await getAddressFromCoords(latitude, longitude);
      town = locationData.town;
      county = locationData.county;
      country = locationData.country;
    }

    console.log('📍 Incoming Report:', { latitude, longitude, town, county, country, priority, email });

    // Create the new report document in MongoDB
    const newReport = await Report.create({ latitude, longitude, town, county, country, priority, email });

    // Return the newly created document with all its fields
    res.status(201).json({ message: '✅ Report saved successfully!', report: newReport });
  } catch (error) {
    console.error('❌ Error saving report:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// **🔹 GET /reports - Fetch Reports with Optional Email Filtering & Pagination**
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
    console.error('❌ Error fetching reports:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// **🔹 DELETE /report/:id - Delete a Report by ID**
app.delete('/report/:id', async (req, res) => {
  try {
    const reportId = req.params.id;
    const deletedReport = await Report.findByIdAndDelete(reportId);

    if (!deletedReport) return res.status(404).json({ error: 'Report not found' });

    res.json({ message: '✅ Report deleted successfully!', report: deletedReport });
  } catch (error) {
    console.error(' Error deleting report:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// **🔹 Start the Server**
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
