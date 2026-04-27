const express = require('express');
const { getHotels, getHotel, createHotel, updateHotel, deleteHotel, getFinancialStats, exportFinancialCSV, getHotelDashboard, getAdminPlatformStats, getMyHotels, checkAvailability} = require('../controllers/hotels');

const bookingRouter = require('./bookings');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');

/**
 * @swagger
 * components:
 *   schemas:
 *     Hotel:
 *       type: object
 *       required:
 *         - name
 *         - address
 *         - telephone
 *       properties:
 *         _id:
 *           type: string
 *           description: Auto-generated hotel ID
 *         name:
 *           type: string
 *           maxLength: 100
 *           description: Hotel name
 *         address:
 *           type: string
 *           description: Hotel address
 *         telephone:
 *           type: string
 *           description: Hotel telephone number
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *       example:
 *         _id: 60d5ec49f1b2c72b8c8e4f1a
 *         name: Grand Hotel Bangkok
 *         address: 123 Sukhumvit Road, Bangkok
 *         telephone: "021234567"
 */

/**
 * @swagger
 * tags:
 *   name: Hotels
 *   description: Hotel management
 */

router.use('/:hotelId/bookings', bookingRouter);

/**
 * @swagger
 * /hotels:
 *   get:
 *     summary: Get all hotels
 *     tags: [Hotels]
 *     parameters:
 *       - in: query
 *         name: select
 *         schema:
 *           type: string
 *         description: Fields to select (comma-separated)
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *         description: Sort by field (prefix with - for descending)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 25
 *         description: Number of results per page
 *     responses:
 *       200:
 *         description: List of hotels
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                 pagination:
 *                   type: object
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Hotel'
 *   post:
 *     summary: Create a new hotel (Admin only)
 *     tags: [Hotels]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - address
 *               - telephone
 *             properties:
 *               name:
 *                 type: string
 *                 example: Grand Hotel Bangkok
 *               address:
 *                 type: string
 *                 example: 123 Sukhumvit Road, Bangkok
 *               telephone:
 *                 type: string
 *                 example: "021234567"
 *     responses:
 *       201:
 *         description: Hotel created successfully
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden - Admin only
 */
router.route('/')
    .get(getHotels)
    .post(protect, authorize('admin'), createHotel);

// Static routes MUST be defined before any /:param routes to avoid Express
// treating the literal segment (e.g. "admin") as a dynamic parameter.
router.route('/admin/dashboard')
    .get(protect, authorize('admin'), getAdminPlatformStats);

router.route('/my-hotels')
    .get(protect, authorize('owner'), getMyHotels);

/**
 * @swagger
 * /hotels/{id}:
 *   get:
 *     summary: Get hotel by ID
 *     tags: [Hotels]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Hotel ID
 *     responses:
 *       200:
 *         description: Hotel details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Hotel'
 *       404:
 *         description: Hotel not found
 *   put:
 *     summary: Update hotel (Admin only)
 *     tags: [Hotels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Hotel ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               address:
 *                 type: string
 *               telephone:
 *                 type: string
 *     responses:
 *       200:
 *         description: Hotel updated successfully
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden - Admin only
 *       404:
 *         description: Hotel not found
 *   delete:
 *     summary: Delete hotel (Admin only)
 *     tags: [Hotels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Hotel ID
 *     responses:
 *       200:
 *         description: Hotel deleted successfully
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden - Admin only
 *       404:
 *         description: Hotel not found
 */
router.route('/:hotelId/financial')
    .get(protect, authorize('admin', 'owner'), getFinancialStats);

router.route('/:hotelId/financial/export')
    .get(protect, authorize('admin', 'owner'), exportFinancialCSV);

router.route('/:hotelId/dashboard')
    .get(protect, authorize('admin', 'owner'), getHotelDashboard);

// Availability check — public, used by booking and edit pages
router.route('/:hotelId/availability')
    .get(checkAvailability);

router.route('/:id')
    .get(getHotel)
    .put(protect, authorize('admin', 'owner'), updateHotel)
    .delete(protect, authorize('admin'), deleteHotel);

module.exports = router;
