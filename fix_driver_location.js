// fix_driver_locations.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

const fixDriverLocations = async () => {
  console.log('🔧 Starting driver location fix...');
  console.log('📁 Looking for .env file at:', path.join(__dirname, '.env'));
  
  try {
    // Connect to MongoDB
    console.log('🔗 Connecting to MongoDB...');
    console.log('📊 Using URI:', process.env.MONGODB_URI);
    
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ Connected to MongoDB');

    // Import User model
    const User = require('./models/User');

    // Update Edhi Driver
    console.log('\n📝 Updating Edhi Driver (driver@irs.com)...');
    const edhiDriver = await User.findOneAndUpdate(
      { email: "driver@irs.com" },
      {
        $set: {
          location: {
            type: "Point",
            coordinates: [67.0822, 24.9056],
            address: "Gulshan-e-Iqbal, Karachi"
          }
        }
      },
      { new: true }
    );
    
    if (edhiDriver) {
      console.log('✅ Updated Edhi Driver:', {
        name: edhiDriver.name,
        coordinates: edhiDriver.location?.coordinates
      });
    } else {
      console.log('❌ Edhi Driver not found!');
    }

    // Update Chippa Driver
    console.log('\n📝 Updating Chippa Driver (driver2@irs.com)...');
    const chippaDriver = await User.findOneAndUpdate(
      { email: "driver2@irs.com" },
      {
        $set: {
          location: {
            type: "Point",
            coordinates: [67.0845, 24.8655],
            address: "Shahrah-e-Faisal, Karachi"
          }
        }
      },
      { new: true }
    );
    
    if (chippaDriver) {
      console.log('✅ Updated Chippa Driver:', {
        name: chippaDriver.name,
        coordinates: chippaDriver.location?.coordinates
      });
    } else {
      console.log('❌ Chippa Driver not found!');
    }

    // Verify all drivers
    console.log('\n📊 All drivers after update:');
    const allDrivers = await User.find({ role: 'driver' }).select('name email location');
    
    if (allDrivers.length === 0) {
      console.log('❌ No drivers found in database!');
    } else {
      allDrivers.forEach(driver => {
        console.log(`\n👤 ${driver.name} (${driver.email}):`);
        if (driver.location && driver.location.coordinates) {
          console.log(`   📍 Coordinates: [${driver.location.coordinates}]`);
          console.log(`   🏠 Address: ${driver.location.address || 'No address'}`);
        } else {
          console.log(`   ❌ No location data!`);
        }
      });
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
};

// Run the fix
fixDriverLocations();