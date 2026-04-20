// ============================================================
// FILE 1: backend/services/hospitalTimer.js  (CREATE NEW FILE)
// ============================================================

class HospitalTimerService {
  constructor() {
    this.timers = new Map(); // incidentId -> { timer, hospitalName, driverId, startTime }
    this.io = null;
  }

  initialize(io) {
    this.io = io;
  }

  startTimer(incidentId, hospitalName, driverId, onTimeout) {
    this.clearTimer(incidentId); // clear any existing timer first
    const startTime = Date.now();
    const TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

    const timer = setTimeout(async () => {
      console.log(`⏱️ Hospital timer expired: incident=${incidentId}, hospital=${hospitalName}`);
      this.timers.delete(incidentId);
      await onTimeout(incidentId, hospitalName, driverId);
    }, TIMEOUT_MS);

    this.timers.set(incidentId, { timer, hospitalName, driverId, startTime });
    console.log(`⏱️ Hospital 2-min timer started: incident=${incidentId}, hospital=${hospitalName}`);
    return true;
  }

  clearTimer(incidentId) {
    const entry = this.timers.get(incidentId);
    if (entry) {
      clearTimeout(entry.timer);
      this.timers.delete(incidentId);
      console.log(`✅ Hospital timer cleared for incident ${incidentId}`);
      return true;
    }
    return false;
  }

  getRemainingMs(incidentId) {
    const entry = this.timers.get(incidentId);
    if (!entry) return 0;
    return Math.max(0, 2 * 60 * 1000 - (Date.now() - entry.startTime));
  }

  isActive(incidentId) {
    return this.timers.has(incidentId);
  }
}

module.exports = new HospitalTimerService();


// ============================================================
// FILE 2: Add these two functions to incidents.js controller
// ============================================================

// @desc    Driver selects hospital — alert hospital with 2-min timer
// @route   PUT /api/incidents/:id/request-hospital
// @access  Private (Driver)
exports.requestHospital = async (req, res, next) => {
  try {
    const { hospital, patientCondition } = req.body;
    const incidentId = req.params.id;
    const driverId = req.user.id;

    if (!hospital) {
      return res.status(400).json({ success: false, message: 'Hospital name is required' });
    }

    const incident = await Incident.findById(incidentId);
    if (!incident) return res.status(404).json({ success: false, message: 'Incident not found' });

    if (incident.assignedTo?.driver?.toString() !== driverId.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    // Update incident
    incident.patientStatus = {
      ...incident.patientStatus,
      condition: patientCondition || 'Awaiting hospital confirmation',
      hospital: hospital,
      updatedAt: new Date()
    };
    incident.hospitalStatus = 'pending';
    incident.driverStatus = 'awaiting_hospital';

    incident.actions.push({
      action: 'hospital_requested',
      performedBy: driverId,
      details: { hospital, patientCondition },
      timestamp: new Date()
    });

    await incident.save();
    await incident.populate('reportedBy', 'name email phone');
    await incident.populate('assignedTo.driver', 'name phone');

    console.log(`🏥 Driver ${driverId} requested hospital: ${hospital} for incident ${incidentId}`);

    // Emit to hospital room
    if (req.io) {
      const hospitalRoom = `hospital_${hospital.replace(/\s+/g, '_')}`;
      req.io.to(hospitalRoom).emit('incomingCaseAlert', {
        incidentId: incident._id,
        incident: incident,
        hospital: hospital,
        driverName: req.user.name,
        patientCondition: patientCondition || 'Unknown',
        timerSeconds: 120,
        message: 'Ambulance requesting entry — patient incoming',
        requestedAt: new Date().toISOString()
      });
      console.log(`📡 Emitted incomingCaseAlert to ${hospitalRoom}`);

      req.io.to(`driver_${driverId}`).emit('hospitalRequestSent', {
        incidentId: incidentId,
        hospital: hospital,
        timerSeconds: 120,
        message: `Request sent to ${hospital}. Waiting for response...`
      });
    }

    // Start 2-minute hospital timer
    const hospitalTimerService = require('../services/hospitaltimer');
    if (req.io && !hospitalTimerService.io) hospitalTimerService.initialize(req.io);

    hospitalTimerService.startTimer(incidentId, hospital, driverId, async (iId, hosp, dId) => {
      console.log(`⏱️ Auto-accepting: hospital ${hosp} did not respond for incident ${iId}`);
      const inc = await Incident.findById(iId);
      if (!inc || inc.hospitalStatus !== 'pending') return;

      inc.hospitalStatus = 'incoming';
      inc.driverStatus = 'transporting';
      inc.actions.push({ action: 'hospital_auto_accepted', details: { hospital: hosp, reason: 'No response within 2 minutes' }, timestamp: new Date() });
      await inc.save();

      if (req.io) {
        req.io.to(`driver_${dId}`).emit('hospitalAccepted', {
          incidentId: iId,
          hospital: hosp,
          autoAccepted: true,
          message: `${hosp} did not respond — proceeding automatically`
        });
        req.io.to('admins').emit('incidentUpdated', inc);
      }
    });

    res.status(200).json({
      success: true,
      data: incident,
      message: `Hospital ${hospital} has been alerted. Waiting for acceptance (2 min timeout).`,
      timerStarted: true,
      timerSeconds: 120
    });

  } catch (error) {
    console.error('❌ Error requesting hospital:', error);
    next(error);
  }
};


// @desc    Hospital accepts or rejects an incoming case
// @route   PUT /api/incidents/:id/hospital-respond
// @access  Private (Hospital)
exports.hospitalRespond = async (req, res, next) => {
  try {
    const { response, reason } = req.body; // response: 'accept' | 'reject'
    const incidentId = req.params.id;
    const hospitalName = req.user.hospital;

    if (!['accept', 'reject'].includes(response)) {
      return res.status(400).json({ success: false, message: 'response must be accept or reject' });
    }

    const incident = await Incident.findById(incidentId);
    if (!incident) return res.status(404).json({ success: false, message: 'Incident not found' });

    if (incident.patientStatus?.hospital !== hospitalName) {
      return res.status(403).json({ success: false, message: 'This case is not assigned to your hospital' });
    }

    if (incident.hospitalStatus !== 'pending') {
      return res.status(409).json({ success: false, message: `Case already responded to (status: ${incident.hospitalStatus})` });
    }

    // Clear the 2-minute timer
    const hospitalTimerService = require('../services/hospitaltimer');
    hospitalTimerService.clearTimer(incidentId);

    const driverId = incident.assignedTo?.driver?.toString();

    if (response === 'accept') {
      incident.hospitalStatus = 'incoming';
      incident.driverStatus = 'transporting';
      incident.actions.push({ action: 'hospital_accepted', performedBy: req.user.id, details: { hospital: hospitalName }, timestamp: new Date() });
      await incident.save();
      await incident.populate('reportedBy', 'name email phone');
      await incident.populate('assignedTo.driver', 'name phone');

      console.log(`✅ Hospital ${hospitalName} ACCEPTED incident ${incidentId}`);

      if (req.io) {
        req.io.to(`driver_${driverId}`).emit('hospitalAccepted', {
          incidentId: incidentId,
          hospital: hospitalName,
          autoAccepted: false,
          message: `${hospitalName} has accepted your case. Proceed to the hospital.`
        });
        req.io.to('admins').emit('incidentUpdated', incident);
        req.io.to('departments').emit('incidentUpdated', incident);
      }

      return res.status(200).json({ success: true, data: incident, message: 'Case accepted. Driver has been notified.' });

    } else {
      // REJECT — clear hospital assignment, revert driver to arrived
      incident.hospitalStatus = 'pending';
      incident.driverStatus = 'arrived';
      incident.patientStatus = { ...incident.patientStatus, hospital: null, updatedAt: new Date() };
      incident.actions.push({ action: 'hospital_rejected', performedBy: req.user.id, details: { hospital: hospitalName, reason: reason || 'No capacity' }, timestamp: new Date() });
      await incident.save();
      await incident.populate('reportedBy', 'name email phone');
      await incident.populate('assignedTo.driver', 'name phone');

      console.log(`❌ Hospital ${hospitalName} REJECTED incident ${incidentId}. Reason: ${reason}`);

      if (req.io) {
        req.io.to(`driver_${driverId}`).emit('hospitalRejected', {
          incidentId: incidentId,
          hospital: hospitalName,
          reason: reason || 'No capacity at this time',
          message: `${hospitalName} rejected the case. Please select another hospital.`
        });
        req.io.to('admins').emit('incidentUpdated', incident);
      }

      return res.status(200).json({ success: true, data: incident, message: 'Case rejected. Driver has been notified to select another hospital.' });
    }

  } catch (error) {
    console.error('❌ Error responding to hospital request:', error);
    next(error);
  }
};


// ============================================================
// FILE 3: incidents.js ROUTES — add these 2 lines
// In the import block add:  requestHospital, hospitalRespond,
// Add BEFORE router.route('/:id'):
// ============================================================

// router.put('/:id/request-hospital', protect, authorize('driver'), requestHospital);
// router.put('/:id/hospital-respond', protect, authorize('hospital'), hospitalRespond);


// ============================================================
// FILE 4: models/Incident.js — add 'awaiting_hospital' to driverStatus enum
// ============================================================

// Find this in the schema:
//   driverStatus: {
//     type: String,
//     enum: ['assigned', 'arrived', 'transporting', 'delivered', 'completed', 'pending_acceptance', 'accepted', 'rejected'],
//
// Change to:
//   driverStatus: {
//     type: String,
//     enum: ['assigned', 'arrived', 'transporting', 'delivered', 'completed', 'pending_acceptance', 'accepted', 'rejected', 'awaiting_hospital'],


// ============================================================
// FILE 5: Your socket connection handler — add hospital room joining
// Find where you handle socket connections (likely server.js or socket.js)
// Inside the connection handler where drivers join their room, ADD:
// ============================================================

// if (user.role === 'hospital' && user.hospital) {
//   const hospitalRoom = `hospital_${user.hospital.replace(/\s+/g, '_')}`;
//   socket.join(hospitalRoom);
//   console.log(`🏥 Hospital ${user.hospital} joined room: ${hospitalRoom}`);
// }