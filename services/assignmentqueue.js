// // backend/services/assignmentqueue.js

// class DriverMatchingQueue {
//   constructor() {
//     this.pendingAssignments = new Map(); // incidentId -> assignment data
//     this.processingTimers = new Map(); // incidentId -> timer
//     this.io = null; // Will be set when initialized
//   }

//   // Call this from server.js after socket.io is initialized
//   initialize(io) {
//     this.io = io;
//     console.log('✅ DriverMatchingQueue initialized');
//   }

//   async addIncidentToQueue(incident) {
//     try {
//       console.log(`📥 Adding incident ${incident._id} to assignment queue`);
//       console.log('📍 Incident location:', incident.location.coordinates);
      
//       // Get all available drivers with ETAs
//       const driversWithETA = await this.getAvailableDriversWithETA(incident);
      
//       console.log(`📊 Found ${driversWithETA.length} available drivers with ETA`);
      
//       if (driversWithETA.length === 0) {
//         console.log('⚠️ No available drivers for incident', incident._id);
//         return null;
//       }
      
//       // Group by department
//       const byDepartment = {};
//       driversWithETA.forEach(driver => {
//         const dept = driver.department?.toString() || 'Unknown Department';
//         if (!byDepartment[dept]) {
//           byDepartment[dept] = {
//             department: dept,
//             drivers: [],
//             bestETA: Infinity
//           };
//         }
//         byDepartment[dept].drivers.push(driver);
//         if (driver.eta < byDepartment[dept].bestETA) {
//           byDepartment[dept].bestETA = driver.eta;
//         }
//       });
      
//       // Sort departments by best ETA
//       const sortedDepartments = Object.values(byDepartment).sort(
//         (a, b) => a.bestETA - b.bestETA
//       );
      
//       console.log('📊 Department rankings:');
//       sortedDepartments.forEach((dept, index) => {
//         console.log(`   #${index + 1} ${dept.department}: ${dept.bestETA} min`);
//       });
      
//       // Create assignment record
//       const assignment = {
//         incidentId: incident._id.toString(),
//         incident: incident,
//         departments: sortedDepartments,
//         bestDepartment: sortedDepartments[0],
//         claimedBy: null,
//         claimedAt: null,
//         status: 'pending', // pending, claimed, expired
//         createdAt: new Date(),
//         expiresAt: new Date(Date.now() + 30000) // 30 seconds total
//       };
      
//       this.pendingAssignments.set(incident._id.toString(), assignment);
      
//       // Set timer for priority window (first 15 seconds for closest dept)
//       const priorityTimer = setTimeout(() => {
//         this.handlePriorityWindowEnd(incident._id);
//       }, 15000);
      
//       this.processingTimers.set(incident._id.toString(), priorityTimer);
      
//       // Notify all departments with their rank
//       this.notifyDepartments(assignment);
      
//       return assignment;
      
//     } catch (error) {
//       console.error('Error adding incident to queue:', error);
//       return null;
//     }
//   }

//   async getAvailableDriversWithETA(incident) {
//     const User = require('../models/User');
    
//     // MongoDB stores coordinates as [longitude, latitude]
//     const incidentLng = incident.location.coordinates[0];
//     const incidentLat = incident.location.coordinates[1];
    
//     console.log('📍 Incident location:', { lat: incidentLat, lng: incidentLng });
    
//     // Find all active drivers with valid coordinates
//     const drivers = await User.find({
//       role: 'driver',
//       status: 'active',
//       'location.coordinates': { $exists: true, $ne: null }
//     }).select('name department location status email');
    
//     console.log(`📊 Found ${drivers.length} active drivers in database`);
    
//     // Log each driver's location for debugging
//     drivers.forEach(driver => {
//       console.log(`👤 Driver ${driver.name} (${driver.department}):`, {
//         coordinates: driver.location?.coordinates,
//         hasLocation: !!driver.location?.coordinates
//       });
//     });
    
//     const driversWithETA = drivers.map(driver => {
//       // Skip if no coordinates
//       if (!driver.location || !driver.location.coordinates || driver.location.coordinates.length < 2) {
//         console.log(`⚠️ Driver ${driver.name} has no valid coordinates`);
//         return null;
//       }
      
//       // MongoDB stores as [longitude, latitude]
//       const driverLng = driver.location.coordinates[0];
//       const driverLat = driver.location.coordinates[1];
      
//       console.log(`📍 Calculating distance for ${driver.name}:`, {
//         driver: { lat: driverLat, lng: driverLng },
//         incident: { lat: incidentLat, lng: incidentLng }
//       });
      
//       const eta = this.calculateETA(
//         driverLat, driverLng,
//         incidentLat, incidentLng
//       );
      
//       return {
//         driverId: driver._id,
//         driverName: driver.name,
//         department: driver.department || 'Unknown Department',
//         eta: eta,
//         distance: eta * 0.667 // Rough conversion: eta minutes to distance km (40 km/h = 0.667 km/min)
//       };
//     }).filter(d => d !== null).sort((a, b) => a.eta - b.eta);
    
//     console.log('📊 Calculated ETAs:');
//     driversWithETA.forEach(d => {
//       console.log(`   ${d.driverName} (${d.department}): ${d.eta} min`);
//     });
    
//     return driversWithETA;
//   }

//   calculateETA(lat1, lon1, lat2, lon2) {
//     console.log('📍 Calculating ETA between:');
//     console.log(`   Point 1: (${lat1}, ${lon1})`);
//     console.log(`   Point 2: (${lat2}, ${lon2})`);
    
//     const R = 6371; // km
//     const dLat = (lat2 - lat1) * Math.PI / 180;
//     const dLon = (lon2 - lon1) * Math.PI / 180;
//     const a = 
//       Math.sin(dLat/2) * Math.sin(dLat/2) +
//       Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
//       Math.sin(dLon/2) * Math.sin(dLon/2);
//     const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
//     const distance = R * c; // km
    
//     console.log(`   Distance: ${distance.toFixed(2)} km`);
    
//     // If distance is extremely large (> 1000 km), coordinates are probably wrong
//     if (distance > 1000) {
//       console.log(`⚠️ WARNING: Distance > 1000km (${distance.toFixed(2)}km) - possible coordinate issue`);
//     }
    
//     // Assume average speed 40 km/h in city
//     const etaMinutes = (distance / 40) * 60;
//     const roundedETA = Math.round(etaMinutes * 10) / 10;
    
//     console.log(`   ETA: ${roundedETA} minutes`);
    
//     return roundedETA;
//   }

//   handlePriorityWindowEnd(incidentId) {
//     const assignment = this.pendingAssignments.get(incidentId.toString());
//     if (!assignment || assignment.claimedBy) return;
    
//     console.log(`⏰ Priority window ended for incident ${incidentId}`);
    
//     // Notify all departments it's now open
//     if (this.io) {
//       this.io.to('departments').emit('incidentOpenToAll', {
//         incidentId: incidentId,
//         message: 'Priority window ended - now open to all departments'
//       });
//     }
    
//     // Set expiration timer (another 15 seconds)
//     const expireTimer = setTimeout(() => {
//       this.handleAssignmentExpiry(incidentId);
//     }, 15000);
    
//     this.processingTimers.set(incidentId.toString(), expireTimer);
//   }

//   handleAssignmentExpiry(incidentId) {
//     const assignment = this.pendingAssignments.get(incidentId.toString());
//     if (!assignment || assignment.claimedBy) return;
    
//     console.log(`⌛ Assignment expired for incident ${incidentId}`);
    
//     // Auto-assign to best available driver
//     this.autoAssignIncident(incidentId);
//   }

//  async autoAssignIncident(incidentId) {
//   const assignment = this.pendingAssignments.get(incidentId.toString());
//   if (!assignment) return;
  
//   const bestDepartment = assignment.bestDepartment;
//   const bestDriver = bestDepartment.drivers[0];
  
//   if (bestDriver) {
//     console.log(`🤖 Auto-assigning incident ${incidentId} to ${bestDriver.driverName} (${bestDriver.department})`);
    
//     const Incident = require('../models/Incident');
//     const incident = await Incident.findById(incidentId);
    
//     incident.assignedTo = {
//       department: bestDriver.department,
//       driver: bestDriver.driverId,
//       assignedAt: new Date(),
//       assignmentType: 'auto_assigned',
//       driverName: bestDriver.driverName
//     };
//     incident.status = 'assigned';
//     incident.driverStatus = 'assigned'; // 🔥 CHANGED: Use 'assigned' instead of 'pending_response'
//     await incident.save();
    
//     // Notify departments
//     if (this.io) {
//       this.io.to('departments').emit('incidentAutoAssigned', {
//         incidentId: incidentId,
//         assignedTo: bestDriver.department,
//         driverName: bestDriver.driverName
//       });
      
//       // 🔥 FIXED: Get populated incident for driver notification
//       const populatedIncident = await Incident.findById(incidentId)
//         .populate('reportedBy', 'name phone')
//         .populate('assignedTo.driver', 'name phone');
      
//       // 🔥 FIXED: Emit to specific driver room
//       this.io.to(`driver_${bestDriver.driverId}`).emit('incidentAssigned', {
//         incident: populatedIncident,
//         eta: bestDriver.eta,
//         distance: bestDriver.distance,
//         message: 'New incident assigned to you'
//       });
      
//       console.log(`📡 Emitted incidentAssigned to driver_${bestDriver.driverId}`);
//     }
//   }
  
//   this.cleanupIncident(incidentId);
// }

//   async claimIncident(incidentId, departmentName, driverId) {
//     const assignment = this.pendingAssignments.get(incidentId.toString());
    
//     if (!assignment) {
//       return { success: false, message: 'Incident not available for assignment' };
//     }
    
//     if (assignment.claimedBy) {
//       return { 
//         success: false, 
//         message: `Already claimed by ${assignment.claimedBy}`,
//         claimedBy: assignment.claimedBy
//       };
//     }
    
//     // Check if this department is the closest
//     const isClosest = assignment.bestDepartment?.department === departmentName;
//     const timeElapsed = Date.now() - assignment.createdAt;
    
//     // Closest department gets 15 second priority
//     if (!isClosest && timeElapsed < 15000) {
//       return {
//         success: false,
//         message: `Closest department (${assignment.bestDepartment?.department}) has priority for ${Math.ceil((15000 - timeElapsed)/1000)} more seconds`,
//         waitTime: 15000 - timeElapsed,
//         closestDepartment: assignment.bestDepartment?.department
//       };
//     }
    
//     // Clear all timers
//     const timer = this.processingTimers.get(incidentId.toString());
//     if (timer) clearTimeout(timer);
    
//     // Assign
//     const Incident = require('../models/Incident');
//     const incident = await Incident.findById(incidentId);
    
//     incident.assignedTo = {
//       department: departmentName,
//       driver: driverId,
//       assignedAt: new Date(),
//       assignmentType: isClosest ? 'priority_claim' : 'standard_claim'
//     };
//     incident.status = 'assigned';
//     await incident.save();
    
//     assignment.claimedBy = departmentName;
//     assignment.claimedAt = new Date();
//     assignment.status = 'claimed';
    
//     // Notify all departments
//     if (this.io) {
//       this.io.to('departments').emit('incidentClaimed', {
//         incidentId: incidentId,
//         claimedBy: departmentName,
//         isClosest: isClosest
//       });
//     }
    
//     this.cleanupIncident(incidentId);
    
//     return {
//       success: true,
//       message: isClosest ? 'Priority claim successful' : 'Claim successful',
//       assignmentType: isClosest ? 'priority' : 'standard'
//     };
//   }

//   notifyDepartments(assignment) {
//     if (!this.io) return;
    
//     console.log(`📡 Notifying departments about incident ${assignment.incidentId}`);
    
//     // Send to all departments with their specific rank
//     assignment.departments.forEach((dept, index) => {
//       const deptRoom = `dept_${dept.department}`;
//       console.log(`   Emitting to ${deptRoom}: Rank #${index + 1}, ETA: ${dept.bestETA} min`);
      
//       this.io.to(deptRoom).emit('incidentAvailable', {
//         incidentId: assignment.incidentId,
//         incident: {
//           id: assignment.incident._id,
//           category: assignment.incident.category,
//           priority: assignment.incident.priority,
//           location: assignment.incident.location
//         },
//         yourRank: index + 1,
//         yourBestETA: dept.bestETA,
//         totalDepartments: assignment.departments.length,
//         priorityWindow: 15000,
//         distances: assignment.departments.map(d => ({
//           department: d.department,
//           eta: d.bestETA
//         }))
//       });
//     });
//   }

//   cleanupIncident(incidentId) {
//     const timer = this.processingTimers.get(incidentId.toString());
//     if (timer) clearTimeout(timer);
    
//     this.processingTimers.delete(incidentId.toString());
//     this.pendingAssignments.delete(incidentId.toString());
//   }

//   getAssignmentStatus(incidentId) {
//     return this.pendingAssignments.get(incidentId.toString()) || null;
//   }

//   async autoAssignIncident(incidentId) {
//   const assignment = this.pendingAssignments.get(incidentId.toString());
//   if (!assignment) return;
  
//   const bestDepartment = assignment.bestDepartment;
//   const bestDriver = bestDepartment.drivers[0];
  
//   if (bestDriver) {
//     console.log(`🤖 Auto-assigning incident ${incidentId} to ${bestDriver.driverName} (${bestDriver.department})`);
    
//     const Incident = require('../models/Incident');
//     const incident = await Incident.findById(incidentId);
    
//     incident.assignedTo = {
//       department: bestDriver.department,
//       driver: bestDriver.driverId,
//       assignedAt: new Date(),
//       assignmentType: 'auto_assigned',
//       driverName: bestDriver.driverName
//     };
//     incident.status = 'assigned';
//     incident.driverStatus = 'pending_response'; // Add this status for driver response
//     await incident.save();
    
//     // Notify departments
//     if (this.io) {
//       this.io.to('departments').emit('incidentAutoAssigned', {
//         incidentId: incidentId,
//         assignedTo: bestDriver.department,
//         driverName: bestDriver.driverName
//       });
      
//       // 🔥 NEW: Notify the specific driver
//       const populatedIncident = await Incident.findById(incidentId)
//         .populate('reportedBy', 'name phone')
//         .populate('assignedTo.driver', 'name phone');
      
//       this.io.to(`driver_${bestDriver.driverId}`).emit('incidentAssigned', {
//         incident: populatedIncident,
//         eta: bestDriver.eta,
//         distance: bestDriver.distance,
//         message: 'New incident assigned to you'
//       });
      
//       console.log(`📡 Emitted incidentAssigned to driver_${bestDriver.driverId}`);
//     }
//   }
  
//   this.cleanupIncident(incidentId);
// }
// }

// module.exports = new DriverMatchingQueue();



// backend/services/assignmentqueue.js

class DriverMatchingQueue {
  constructor() {
    this.pendingAssignments = new Map(); // incidentId -> assignment data
    this.processingTimers = new Map(); // incidentId -> timer
    this.io = null; // Will be set when initialized
  }

  // Call this from server.js after socket.io is initialized
  initialize(io) {
    this.io = io;
    console.log('✅ DriverMatchingQueue initialized');
  }

  async addIncidentToQueue(incident) {
    try {
      console.log(`📥 Adding incident ${incident._id} to assignment queue`);
      console.log('📍 Incident location:', incident.location.coordinates);
      
      // Get all available drivers with ETAs
      const driversWithETA = await this.getAvailableDriversWithETA(incident);
      
      console.log(`📊 Found ${driversWithETA.length} available drivers with ETA`);
      
      if (driversWithETA.length === 0) {
        console.log('⚠️ No available drivers for incident', incident._id);
        return null;
      }
      
      // Group by department
      const byDepartment = {};
      driversWithETA.forEach(driver => {
        const dept = driver.department?.toString() || 'Unknown Department';
        if (!byDepartment[dept]) {
          byDepartment[dept] = {
            department: dept,
            drivers: [],
            bestETA: Infinity
          };
        }
        byDepartment[dept].drivers.push(driver);
        if (driver.eta < byDepartment[dept].bestETA) {
          byDepartment[dept].bestETA = driver.eta;
        }
      });
      
      // Sort departments by best ETA
      const sortedDepartments = Object.values(byDepartment).sort(
        (a, b) => a.bestETA - b.bestETA
      );
      
      console.log('📊 Department rankings:');
      sortedDepartments.forEach((dept, index) => {
        console.log(`   #${index + 1} ${dept.department}: ${dept.bestETA} min`);
      });
      
      // Create assignment record
      const assignment = {
        incidentId: incident._id.toString(),
        incident: incident,
        departments: sortedDepartments,
        bestDepartment: sortedDepartments[0],
        claimedBy: null,
        claimedAt: null,
        status: 'pending',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30000)
      };
      
      this.pendingAssignments.set(incident._id.toString(), assignment);
      
      // Set timer for priority window (first 15 seconds for closest dept)
      const priorityTimer = setTimeout(() => {
        this.handlePriorityWindowEnd(incident._id);
      }, 15000);
      
      this.processingTimers.set(incident._id.toString(), priorityTimer);
      
      // Notify all departments with their rank
      this.notifyDepartments(assignment);
      
      return assignment;
      
    } catch (error) {
      console.error('Error adding incident to queue:', error);
      return null;
    }
  }

  async getAvailableDriversWithETA(incident) {
    const User = require('../models/User');
    
    const incidentLng = incident.location.coordinates[0];
    const incidentLat = incident.location.coordinates[1];
    
    console.log('📍 Incident location:', { lat: incidentLat, lng: incidentLng });
    
    const drivers = await User.find({
      role: 'driver',
      status: 'active',
      'location.coordinates': { $exists: true, $ne: null }
    }).select('name department location status email');
    
    console.log(`📊 Found ${drivers.length} active drivers in database`);
    
    drivers.forEach(driver => {
      console.log(`👤 Driver ${driver.name} (${driver.department}):`, {
        coordinates: driver.location?.coordinates,
        hasLocation: !!driver.location?.coordinates
      });
    });
    
    const driversWithETA = drivers.map(driver => {
      if (!driver.location || !driver.location.coordinates || driver.location.coordinates.length < 2) {
        console.log(`⚠️ Driver ${driver.name} has no valid coordinates`);
        return null;
      }
      
      const driverLng = driver.location.coordinates[0];
      const driverLat = driver.location.coordinates[1];
      
      const eta = this.calculateETA(
        driverLat, driverLng,
        incidentLat, incidentLng
      );
      
      return {
        driverId: driver._id,
        driverName: driver.name,
        department: driver.department || 'Unknown Department',
        eta: eta,
        distance: eta * 0.667
      };
    }).filter(d => d !== null).sort((a, b) => a.eta - b.eta);
    
    console.log('📊 Calculated ETAs:');
    driversWithETA.forEach(d => {
      console.log(`   ${d.driverName} (${d.department}): ${d.eta} min`);
    });
    
    return driversWithETA;
  }

  calculateETA(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    
    const etaMinutes = (distance / 40) * 60;
    return Math.round(etaMinutes * 10) / 10;
  }

  handlePriorityWindowEnd(incidentId) {
    const assignment = this.pendingAssignments.get(incidentId.toString());
    if (!assignment || assignment.claimedBy) return;
    
    console.log(`⏰ Priority window ended for incident ${incidentId}`);
    
    if (this.io) {
      this.io.to('departments').emit('incidentOpenToAll', {
        incidentId: incidentId,
        message: 'Priority window ended - now open to all departments'
      });
    }
    
    const expireTimer = setTimeout(() => {
      this.handleAssignmentExpiry(incidentId);
    }, 15000);
    
    this.processingTimers.set(incidentId.toString(), expireTimer);
  }

  handleAssignmentExpiry(incidentId) {
    const assignment = this.pendingAssignments.get(incidentId.toString());
    if (!assignment || assignment.claimedBy) return;
    
    console.log(`⌛ Assignment expired for incident ${incidentId}`);
    this.autoAssignIncident(incidentId);
  }

  async autoAssignIncident(incidentId) {
    const assignment = this.pendingAssignments.get(incidentId.toString());
    if (!assignment) return;
    
    const bestDepartment = assignment.bestDepartment;
    const bestDriver = bestDepartment.drivers[0];
    
    if (bestDriver) {
      console.log(`🤖 Auto-assigning incident ${incidentId} to ${bestDriver.driverName} (${bestDriver.department})`);
      
      const Incident = require('../models/Incident');
      const incident = await Incident.findById(incidentId);
      
      if (!incident) {
        console.log(`❌ Incident ${incidentId} not found`);
        return;
      }
      
      // 🔥 FIX: Use only valid enum values from the schema
      incident.assignedTo = {
        department: bestDriver.department,
        driver: bestDriver.driverId,
        driverName: bestDriver.driverName,
        assignedAt: new Date(),
        assignmentType: 'auto_assigned'
      };
      
      incident.status = 'assigned';           // Valid from schema
      incident.driverStatus = 'assigned';      // Valid from schema: 'assigned', 'arrived', 'transporting', 'delivered', 'completed'
      
      await incident.save();
      console.log(`✅ Incident ${incidentId} assigned to driver ${bestDriver.driverName}`);
      
      // Populate for driver notification
      const populatedIncident = await Incident.findById(incidentId)
        .populate('reportedBy', 'name email phone')
        .populate('assignedTo.driver', 'name phone');
      
      // Notify departments
      if (this.io) {
        this.io.to('departments').emit('incidentAutoAssigned', {
          incidentId: incidentId,
          assignedTo: bestDriver.department,
          driverName: bestDriver.driverName
        });
        
        // 🔥 FIX: Notify specific driver
        const driverRoom = `driver_${bestDriver.driverId}`;
const roomSockets = await this.io.in(driverRoom).fetchSockets();
console.log(`📊 Sockets in ${driverRoom}: ${roomSockets.length}`);

        
        this.io.to(driverRoom).emit('incidentAssigned', {
          incident: populatedIncident,
          eta: bestDriver.eta,
          distance: bestDriver.distance,
          message: 'New incident assigned to you'
        });
      }
    } else {
      console.log(`❌ No best driver found for incident ${incidentId}`);
    }
    
    this.cleanupIncident(incidentId);
  }

  async claimIncident(incidentId, departmentName, driverId) {
    const assignment = this.pendingAssignments.get(incidentId.toString());
    
    if (!assignment) {
      return { success: false, message: 'Incident not available for assignment' };
    }
    
    if (assignment.claimedBy) {
      return { 
        success: false, 
        message: `Already claimed by ${assignment.claimedBy}`,
        claimedBy: assignment.claimedBy
      };
    }
    
    const isClosest = assignment.bestDepartment?.department === departmentName;
    const timeElapsed = Date.now() - assignment.createdAt;
    
    if (!isClosest && timeElapsed < 15000) {
      return {
        success: false,
        message: `Closest department (${assignment.bestDepartment?.department}) has priority for ${Math.ceil((15000 - timeElapsed)/1000)} more seconds`,
        waitTime: 15000 - timeElapsed,
        closestDepartment: assignment.bestDepartment?.department
      };
    }
    
    const timer = this.processingTimers.get(incidentId.toString());
    if (timer) clearTimeout(timer);
    
    const Incident = require('../models/Incident');
    const incident = await Incident.findById(incidentId);
    
    // 🔥 FIX: Use only valid enum values
    incident.assignedTo = {
      department: departmentName,
      driver: driverId,
      assignedAt: new Date(),
      assignmentType: isClosest ? 'priority_claim' : 'standard_claim'
    };
    incident.status = 'assigned';           // Valid from schema
    incident.driverStatus = 'assigned';      // Valid from schema
    
    await incident.save();
    
    assignment.claimedBy = departmentName;
    assignment.claimedAt = new Date();
    assignment.status = 'claimed';
    
    if (this.io) {
      this.io.to('departments').emit('incidentClaimed', {
        incidentId: incidentId,
        claimedBy: departmentName,
        isClosest: isClosest
      });
    }
    
    this.cleanupIncident(incidentId);
    
    return {
      success: true,
      message: isClosest ? 'Priority claim successful' : 'Claim successful',
      assignmentType: isClosest ? 'priority' : 'standard'
    };
  }

  notifyDepartments(assignment) {
    if (!this.io) return;
    
    console.log(`📡 Notifying departments about incident ${assignment.incidentId}`);
    
    assignment.departments.forEach((dept, index) => {
      const deptRoom = `dept_${dept.department}`;
      console.log(`   Emitting to ${deptRoom}: Rank #${index + 1}, ETA: ${dept.bestETA} min`);
      
      this.io.to(deptRoom).emit('incidentAvailable', {
        incidentId: assignment.incidentId,
        incident: {
          id: assignment.incident._id,
          category: assignment.incident.category,
          priority: assignment.incident.priority,
          location: assignment.incident.location
        },
        yourRank: index + 1,
        yourBestETA: dept.bestETA,
        totalDepartments: assignment.departments.length,
        priorityWindow: 15000,
        distances: assignment.departments.map(d => ({
          department: d.department,
          eta: d.bestETA
        }))
      });
    });
  }

  cleanupIncident(incidentId) {
    const timer = this.processingTimers.get(incidentId.toString());
    if (timer) clearTimeout(timer);
    
    this.processingTimers.delete(incidentId.toString());
    this.pendingAssignments.delete(incidentId.toString());
  }

  getAssignmentStatus(incidentId) {
    return this.pendingAssignments.get(incidentId.toString()) || null;
  }
}

module.exports = new DriverMatchingQueue();