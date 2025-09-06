const express = require('express');
const {
    getAppointments,
    getAppointment,
    bookAppointment,
    updateAppointmentStatus,
    getAvailableSlots,
    bookAppointmentValidation
} = require('../controllers/appointmentController');
const { requireAuth, requirePatient, requireDoctorOrAdmin } = require('../middleware/auth');

const router = express.Router();

/**
 * @route   GET /api/appointments
 * @desc    Get all appointments (filtered by user role)
 * @access  Private
 */
router.get('/', requireAuth, getAppointments);

/**
 * @route   GET /api/appointments/available-slots
 * @desc    Get available time slots for a doctor
 * @access  Private
 */
router.get('/available-slots', requireAuth, getAvailableSlots);

/**
 * @route   GET /api/appointments/:id
 * @desc    Get single appointment
 * @access  Private
 */
router.get('/:id', requireAuth, getAppointment);

/**
 * @route   POST /api/appointments
 * @desc    Book new appointment
 * @access  Private (Patients only)
 */
router.post('/', requirePatient, bookAppointmentValidation, bookAppointment);

/**
 * @route   PUT /api/appointments/:id/status
 * @desc    Update appointment status
 * @access  Private (Doctor/Admin for most statuses, Patient for cancel)
 */
router.put('/:id/status', requireAuth, updateAppointmentStatus);

module.exports = router;