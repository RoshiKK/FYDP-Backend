// routes/dummyDrivers.js
/**
 * @swagger
 * tags:
 *   name: DummyDrivers
 *   description: Dummy driver data for testing and development
 */

/**
 * @swagger
 * /drivers/dummy:
 *   get:
 *     summary: Get dummy drivers with availability and location
 *     tags: [DummyDrivers]
 *     parameters:
 *       - in: query
 *         name: availability
 *         schema:
 *           type: string
 *           enum: [available, busy]
 *         description: Filter by availability
 *       - in: query
 *         name: department
 *         schema:
 *           type: string
 *         description: Filter by department (Edhi Foundation or Chippa Ambulance)
 *       - in: query
 *         name: area
 *         schema:
 *           type: string
 *         description: Filter by area name (Gulshan-e-Iqbal, Nazimabad, etc.)
 *     responses:
 *       200:
 *         description: List of dummy drivers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 summary:
 *                   $ref: '#/components/schemas/DummyDriverSummary'
 *                 filters:
 *                   type: object
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/DummyDriver'
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */

/**
 * @swagger
 * /drivers/dummy/{id}:
 *   get:
 *     summary: Get dummy driver by ID
 *     tags: [DummyDrivers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Driver ID (e.g., DRV001)
 *     responses:
 *       200:
 *         description: Driver details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/DummyDriver'
 *       404:
 *         description: Driver not found
 */

/**
 * @swagger
 * /drivers/dummy/area/{areaName}:
 *   get:
 *     summary: Get dummy drivers by area
 *     tags: [DummyDrivers]
 *     parameters:
 *       - in: path
 *         name: areaName
 *         required: true
 *         schema:
 *           type: string
 *         description: Area name (Gulshan-e-Iqbal, Nazimabad, Shahrah-e-Faisal, etc.)
 *     responses:
 *       200:
 *         description: List of drivers in the area
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                 area:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/DummyDriver'
 */

const express = require('express');
const router = express.Router();
const {
  getDummyDrivers,
  getDummyDriverById,
  getDummyDriversByArea
} = require('../controllers/dummyDrivers');

// @route   GET /api/drivers/dummy
// @desc    Get all dummy drivers
// @access  Public
router.get('/dummy', getDummyDrivers);

// @route   GET /api/drivers/dummy/:id
// @desc    Get dummy driver by ID
// @access  Public
router.get('/dummy/:id', getDummyDriverById);

// @route   GET /api/drivers/dummy/area/:areaName
// @desc    Get dummy drivers by area
// @access  Public
router.get('/dummy/area/:areaName', getDummyDriversByArea);

module.exports = router;