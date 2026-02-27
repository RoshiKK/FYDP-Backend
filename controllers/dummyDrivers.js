// controllers/dummyDrivers.js

// Dummy drivers data with realistic Karachi locations - DRIVER ONLY
const dummyDrivers = [
  {
    id: "DRV001",
    name: "Ahmed Khan",
    phone: "+923001234571",
    department: "Edhi Foundation",
    ambulanceService: "Edhi Foundation",
    availability: "available",
    currentLocation: {
      coordinates: [67.0822, 24.9056], // [longitude, latitude]
      address: "Gulshan Chowrangi, Gulshan-e-Iqbal, Karachi",
      area: "Gulshan-e-Iqbal",
      lat: 24.9056,
      lng: 67.0822
    },
    rating: 4.8,
    completedToday: 3,
    vehicleInfo: {
      plateNumber: "ABC-1234",
      model: "Toyota Hiace Ambulance"
    }
  },
  {
    id: "DRV002",
    name: "Muhammad Ali",
    phone: "+923001234572",
    department: "Chippa Ambulance",
    ambulanceService: "Chippa Ambulance",
    availability: "busy",
    currentLocation: {
      coordinates: [67.0397, 24.8934],
      address: "Nazimabad No. 1, Karachi",
      area: "Nazimabad",
      lat: 24.8934,
      lng: 67.0397
    },
    rating: 4.9,
    completedToday: 5,
    vehicleInfo: {
      plateNumber: "CHP-5678",
      model: "Suzuki Bolan Ambulance"
    }
  },
  {
    id: "DRV003",
    name: "Sarfraz Ahmed",
    phone: "+923001234573",
    department: "Edhi Foundation",
    ambulanceService: "Edhi Foundation",
    availability: "available",
    currentLocation: {
      coordinates: [67.1523, 24.8744],
      address: "Shahrah-e-Faisal, near FTC, Karachi",
      area: "Shahrah-e-Faisal",
      lat: 24.8744,
      lng: 67.1523
    },
    rating: 4.7,
    completedToday: 2,
    vehicleInfo: {
      plateNumber: "EDH-9012",
      model: "Toyota Hiace Ambulance"
    }
  },
  {
    id: "DRV004",
    name: "Bilal Hussain",
    phone: "+923001234574",
    department: "Chippa Ambulance",
    ambulanceService: "Chippa Ambulance",
    availability: "busy",
    currentLocation: {
      coordinates: [67.0011, 24.8608],
      address: "Saddar, near Empress Market, Karachi",
      area: "Saddar",
      lat: 24.8608,
      lng: 67.0011
    },
    rating: 4.6,
    completedToday: 4,
    vehicleInfo: {
      plateNumber: "CHP-3456",
      model: "Suzuki Bolan Ambulance"
    }
  },
  {
    id: "DRV005",
    name: "Kamran Ali",
    phone: "+923001234575",
    department: "Edhi Foundation",
    ambulanceService: "Edhi Foundation",
    availability: "available",
    currentLocation: {
      coordinates: [67.1352, 24.9386],
      address: "DHA Phase 2, near Tank, Karachi",
      area: "DHA",
      lat: 24.9386,
      lng: 67.1352
    },
    rating: 4.9,
    completedToday: 1,
    vehicleInfo: {
      plateNumber: "EDH-7890",
      model: "Toyota Hiace Ambulance"
    }
  },
  {
    id: "DRV006",
    name: "Nadeem Abbas",
    phone: "+923001234576",
    department: "Chippa Ambulance",
    ambulanceService: "Chippa Ambulance",
    availability: "busy",
    currentLocation: {
      coordinates: [66.9906, 24.9248],
      address: "Orangi Town, Sector 11½, Karachi",
      area: "Orangi Town",
      lat: 24.9248,
      lng: 66.9906
    },
    rating: 4.5,
    completedToday: 6,
    vehicleInfo: {
      plateNumber: "CHP-6789",
      model: "Suzuki Bolan Ambulance"
    }
  },
  {
    id: "DRV007",
    name: "Zafar Iqbal",
    phone: "+923001234577",
    department: "Edhi Foundation",
    ambulanceService: "Edhi Foundation",
    availability: "available",
    currentLocation: {
      coordinates: [67.0451, 24.8298],
      address: "Korangi Crossing, Korangi, Karachi",
      area: "Korangi",
      lat: 24.8298,
      lng: 67.0451
    },
    rating: 4.7,
    completedToday: 3,
    vehicleInfo: {
      plateNumber: "EDH-1122",
      model: "Toyota Hiace Ambulance"
    }
  },
  {
    id: "DRV008",
    name: "Tariq Mehmood",
    phone: "+923001234578",
    department: "Chippa Ambulance",
    ambulanceService: "Chippa Ambulance",
    availability: "available",
    currentLocation: {
      coordinates: [67.0974, 24.9619],
      address: "North Nazimabad, Block B, Karachi",
      area: "North Nazimabad",
      lat: 24.9619,
      lng: 67.0974
    },
    rating: 4.8,
    completedToday: 2,
    vehicleInfo: {
      plateNumber: "CHP-3344",
      model: "Suzuki Bolan Ambulance"
    }
  },
  {
    id: "DRV009",
    name: "Waseem Akhtar",
    phone: "+923001234579",
    department: "Edhi Foundation",
    ambulanceService: "Edhi Foundation",
    availability: "busy",
    currentLocation: {
      coordinates: [67.1153, 24.9164],
      address: "PECHS, Block 2, Karachi",
      area: "PECHS",
      lat: 24.9164,
      lng: 67.1153
    },
    rating: 4.6,
    completedToday: 4,
    vehicleInfo: {
      plateNumber: "EDH-5566",
      model: "Toyota Hiace Ambulance"
    }
  },
  {
    id: "DRV010",
    name: "Shahid Afridi",
    phone: "+923001234580",
    department: "Chippa Ambulance",
    ambulanceService: "Chippa Ambulance",
    availability: "available",
    currentLocation: {
      coordinates: [67.0524, 24.9777],
      address: "New Karachi, Sector 5-F, Karachi",
      area: "New Karachi",
      lat: 24.9777,
      lng: 67.0524
    },
    rating: 4.9,
    completedToday: 3,
    vehicleInfo: {
      plateNumber: "CHP-7788",
      model: "Suzuki Bolan Ambulance"
    }
  }
];

// @desc    Get all dummy drivers
// @route   GET /api/drivers/dummy
// @access  Public
const getDummyDrivers = (req, res) => {
  try {
    const { availability, department, area } = req.query;
    
    let filteredDrivers = [...dummyDrivers];
    
    // Apply filters
    if (availability) {
      filteredDrivers = filteredDrivers.filter(d => d.availability === availability);
    }
    
    if (department) {
      filteredDrivers = filteredDrivers.filter(d => 
        d.department.toLowerCase().includes(department.toLowerCase())
      );
    }
    
    if (area) {
      filteredDrivers = filteredDrivers.filter(d => 
        d.currentLocation.area.toLowerCase().includes(area.toLowerCase())
      );
    }

    // Statistics summary
    const summary = {
      totalDrivers: dummyDrivers.length,
      available: dummyDrivers.filter(d => d.availability === 'available').length,
      busy: dummyDrivers.filter(d => d.availability === 'busy').length,
      byDepartment: {
        'Edhi Foundation': dummyDrivers.filter(d => d.department === 'Edhi Foundation').length,
        'Chippa Ambulance': dummyDrivers.filter(d => d.department === 'Chippa Ambulance').length
      }
    };

    res.status(200).json({
      success: true,
      summary,
      filters: {
        applied: {
          availability: availability || 'all',
          department: department || 'all',
          area: area || 'all'
        },
        resultCount: filteredDrivers.length
      },
      drivers: filteredDrivers,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error getting dummy drivers:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving dummy driver data'
    });
  }
};

// @desc    Get single dummy driver by ID
// @route   GET /api/drivers/dummy/:id
// @access  Public
const getDummyDriverById = (req, res) => {
  try {
    const driver = dummyDrivers.find(d => d.id === req.params.id);
    
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    res.status(200).json({
      success: true,
      driver
    });

  } catch (error) {
    console.error('❌ Error getting dummy driver:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving dummy driver data'
    });
  }
};

// @desc    Get dummy drivers by area
// @route   GET /api/drivers/dummy/area/:areaName
// @access  Public
const getDummyDriversByArea = (req, res) => {
  try {
    const { areaName } = req.params;
    
    const drivers = dummyDrivers.filter(d => 
      d.currentLocation.area.toLowerCase().includes(areaName.toLowerCase())
    );

    res.status(200).json({
      success: true,
      count: drivers.length,
      area: areaName,
      drivers
    });

  } catch (error) {
    console.error('❌ Error getting drivers by area:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving drivers by area'
    });
  }
};

module.exports = {
  getDummyDrivers,
  getDummyDriverById,
  getDummyDriversByArea
};