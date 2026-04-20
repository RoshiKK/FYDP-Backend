const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const Incident = require('./models/Incident');

async function checkIncidents() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find incidents with photos regardless of status to see their structure
    const incidents = await Incident.find({ 'photos.0': { $exists: true } }).sort({ createdAt: -1 }).limit(10);
    
    console.log(`Found ${incidents.length} incidents with photos`);
    
    incidents.forEach(inc => {
      console.log(`Incident ${inc._id} (${inc.status}):`);
      console.log(`  Description: ${inc.description}`);
      console.log(`  Photos:`, JSON.stringify(inc.photos, null, 2));
    });

    process.exit(0);
  } catch (err) {
    console.error('💥 Error:', err);
    process.exit(1);
  }
}

checkIncidents();
