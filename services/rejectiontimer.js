// backend/services/rejectiontimer.js
// Tracks 2-minute acceptance windows for driver assignments

class RejectionTimerService {
  constructor() {
    // Map: incidentId -> { timerId, assignedAt, driverId, departmentName }
    this.activeTimers = new Map();
    this.io = null;
  }

  initialize(io) {
    this.io = io;
    console.log('✅ RejectionTimerService initialized');
  }

  /**
   * Start a 2-minute timer when a driver is assigned.
   * Clears any existing timer for this incident first.
   */
  startTimer(incidentId, driverId, departmentName, onTimeout) {
    const key = incidentId.toString();

    // ✅ Always clear existing timer before starting a new one
    this.clearTimer(key);

    const assignedAt = new Date();
    const TWO_MINUTES = 2 * 60 * 1000;

    console.log(`⏱️ Starting 2-min acceptance timer for incident ${key}, driver ${driverId}`);

    const timerId = setTimeout(async () => {
      // ── Timer fired ──────────────────────────────────────────────────────
      console.log(`⏰ 2-minute timeout! Driver ${driverId} did not respond to incident ${key}`);

      // Remove from map FIRST to prevent double-fire
      this.activeTimers.delete(key);

      // Remove from map FIRST to prevent double-fire
      this.activeTimers.delete(key);

      // ✅ RE-CHECK DB before reassigning — driver may have just accepted
      try {
        const Incident = require('../models/Incident');
        const current = await Incident.findById(key).select('driverStatus assignedTo');

        if (!current) {
          console.log(`ℹ️ Incident ${key} no longer exists, skipping timeout reassignment`);
          return;
        }

        const assignedDriverId = current.assignedTo?.driver?.toString();
        const timedOutDriverId = driverId.toString();

        // Only reassign if STILL pending_acceptance AND same driver
        if (current.driverStatus !== 'pending_acceptance') {
          console.log(`ℹ️ Incident ${key} status is '${current.driverStatus}' — driver already responded, skipping timeout`);
          return;
        }

        if (assignedDriverId !== timedOutDriverId) {
          console.log(`ℹ️ Incident ${key} now assigned to different driver (${assignedDriverId}), skipping timeout`);
          return;
        }

        console.log(`🔄 Confirmed timeout — triggering reassignment for incident ${key}`);
      } catch (dbErr) {
        console.error(`❌ DB check failed before timeout reassignment:`, dbErr.message);
        // Still proceed — better to reassign than leave hanging
      }

      // Notify driver their window expired
      if (this.io) {
        this.io.to(`driver_${driverId}`).emit('assignmentExpired', {
          incidentId: key,
          message: 'Assignment expired — you did not respond within 2 minutes',
        });
      }

      // Trigger reassignment callback
      if (onTimeout) {
        await onTimeout(key, driverId, departmentName, 'timeout');
      }
    }, TWO_MINUTES);

    this.activeTimers.set(key, {
      timerId,
      assignedAt,
      driverId: driverId.toString(),
      departmentName,
    });

    // Emit countdown start to driver
    if (this.io) {
      this.io.to(`driver_${driverId}`).emit('assignmentCountdown', {
        incidentId: key,
        timeoutMs: TWO_MINUTES,
        assignedAt: assignedAt.toISOString(),
        message: 'You have 2 minutes to accept or reject this assignment',
      });
    }
  }

  /**
   * Check if a driver's rejection is within the 2-minute window.
   */
  checkRejectionWindow(incidentId, driverId) {
    const timerData = this.activeTimers.get(incidentId.toString());

    if (!timerData) {
      return { withinWindow: false, elapsedMs: 0, reason: 'no_timer' };
    }

    if (timerData.driverId !== driverId.toString()) {
      return { withinWindow: false, elapsedMs: 0, reason: 'wrong_driver' };
    }

    const elapsedMs = Date.now() - timerData.assignedAt.getTime();
    const TWO_MINUTES = 2 * 60 * 1000;
    const withinWindow = elapsedMs <= TWO_MINUTES;

    return {
      withinWindow,
      elapsedMs,
      remainingMs: Math.max(0, TWO_MINUTES - elapsedMs),
    };
  }

  /**
   * Clear the timer for an incident.
   * Called when driver accepts OR rejects.
   */
  clearTimer(incidentId) {
    const key = incidentId.toString();
    const timerData = this.activeTimers.get(key);
    if (timerData) {
      clearTimeout(timerData.timerId);
      this.activeTimers.delete(key);
      console.log(`✅ Cleared timer for incident ${key}`);
      return true;
    }
    console.log(`⚠️ No timer found for incident ${key}`);
    return false;
  }

  getTimerInfo(incidentId) {
    return this.activeTimers.get(incidentId.toString()) || null;
  }

  // For debugging
  getActiveTimerCount() {
    return this.activeTimers.size;
  }
}

module.exports = new RejectionTimerService();