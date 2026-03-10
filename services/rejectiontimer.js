// backend/services/rejectionTimerService.js
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
   * If timer fires (driver didn't respond), auto-reject and reassign.
   */
  startTimer(incidentId, driverId, departmentName, onTimeout) {
    // Clear any existing timer for this incident
    this.clearTimer(incidentId);

    const assignedAt = new Date();
    const TWO_MINUTES = 2 * 60 * 1000; // 2 minutes in ms

    console.log(`⏱️ Starting 2-min acceptance timer for incident ${incidentId}, driver ${driverId}`);

    const timerId = setTimeout(async () => {
      console.log(`⏰ 2-minute timeout! Driver ${driverId} did not respond to incident ${incidentId}`);
      this.activeTimers.delete(incidentId.toString());

      // Notify driver their window expired
      if (this.io) {
        this.io.to(`driver_${driverId}`).emit('assignmentExpired', {
          incidentId: incidentId.toString(),
          message: 'Assignment expired — you did not respond within 2 minutes',
        });
      }

      // Trigger reassignment callback
      if (onTimeout) {
        await onTimeout(incidentId, driverId, departmentName, 'timeout');
      }
    }, TWO_MINUTES);

    this.activeTimers.set(incidentId.toString(), {
      timerId,
      assignedAt,
      driverId: driverId.toString(),
      departmentName,
    });

    // Also emit a countdown start to the driver
    if (this.io) {
      this.io.to(`driver_${driverId}`).emit('assignmentCountdown', {
        incidentId: incidentId.toString(),
        timeoutMs: TWO_MINUTES,
        assignedAt: assignedAt.toISOString(),
        message: 'You have 2 minutes to accept or reject this assignment',
      });
    }
  }

  /**
   * Check if a driver's rejection is within the 2-minute window.
   * Returns { withinWindow: bool, elapsedMs: number }
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
   * Clear the timer (called when driver accepts or rejects).
   */
  // In services/rejectiontimer.js
clearTimer(incidentId) {
  const timerData = this.activeTimers.get(incidentId.toString());
  if (timerData) {
    clearTimeout(timerData.timerId);
    this.activeTimers.delete(incidentId.toString());
    console.log(`✅ Cleared timer for incident ${incidentId}`);
    return true;
  }
  console.log(`⚠️ No timer found for incident ${incidentId}`);
  return false;
}

  /**
   * Get timer info for an incident.
   */
  getTimerInfo(incidentId) {
    return this.activeTimers.get(incidentId.toString()) || null;
  }
}

module.exports = new RejectionTimerService();