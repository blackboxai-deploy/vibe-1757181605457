const { body, validationResult, query } = require('express-validator');
const { findOne, findMany, insertRecord, updateRecord, deleteRecord } = require('../database/connection');

// Validation rules for booking appointment
const bookAppointmentValidation = [
    body('doctorId')
        .isInt({ min: 1 })
        .withMessage('Valid doctor ID is required'),
    body('appointmentDate')
        .isDate()
        .withMessage('Valid appointment date is required'),
    body('startTime')
        .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
        .withMessage('Valid start time is required (HH:MM format)'),
    body('type')
        .isIn(['in-person', 'virtual'])
        .withMessage('Appointment type must be either in-person or virtual'),
    body('reason')
        .trim()
        .isLength({ min: 5, max: 500 })
        .withMessage('Reason must be between 5 and 500 characters')
];

// Get all appointments (filtered by user role)
const getAppointments = async (req, res) => {
    try {
        const { role, id: userId } = req.user;
        const { status, date, type } = req.query;
        
        let query = `
            SELECT 
                a.id,
                a.appointment_date,
                a.start_time,
                a.end_time,
                a.status,
                a.type,
                a.reason,
                a.notes,
                a.created_at,
                CONCAT(p.first_name, ' ', p.last_name) as patient_name,
                p.phone as patient_phone,
                CONCAT(d.first_name, ' ', d.last_name) as doctor_name,
                d.specialization,
                d.consultation_fee
            FROM appointments a
            JOIN patients p ON a.patient_id = p.id
            JOIN doctors d ON a.doctor_id = d.id
        `;
        
        let params = [];
        let conditions = [];

        // Filter based on user role
        if (role === 'patient') {
            const patient = await findOne('SELECT id FROM patients WHERE user_id = ?', [userId]);
            if (!patient) {
                return res.status(404).json({
                    success: false,
                    message: 'Patient profile not found'
                });
            }
            conditions.push('a.patient_id = ?');
            params.push(patient.id);
        } else if (role === 'doctor') {
            const doctor = await findOne('SELECT id FROM doctors WHERE user_id = ?', [userId]);
            if (!doctor) {
                return res.status(404).json({
                    success: false,
                    message: 'Doctor profile not found'
                });
            }
            conditions.push('a.doctor_id = ?');
            params.push(doctor.id);
        }

        // Additional filters
        if (status) {
            conditions.push('a.status = ?');
            params.push(status);
        }
        
        if (date) {
            conditions.push('a.appointment_date = ?');
            params.push(date);
        }
        
        if (type) {
            conditions.push('a.type = ?');
            params.push(type);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDER BY a.appointment_date DESC, a.start_time DESC';

        const appointments = await findMany(query, params);

        res.json({
            success: true,
            data: appointments
        });

    } catch (error) {
        console.error('Get appointments error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch appointments',
            error: error.message
        });
    }
};

// Get single appointment
const getAppointment = async (req, res) => {
    try {
        const { id } = req.params;
        const { role, id: userId } = req.user;

        const appointment = await findOne(`
            SELECT 
                a.*,
                CONCAT(p.first_name, ' ', p.last_name) as patient_name,
                p.phone as patient_phone,
                p.date_of_birth,
                p.blood_type,
                p.allergies,
                CONCAT(d.first_name, ' ', d.last_name) as doctor_name,
                d.specialization,
                d.consultation_fee,
                d.bio
            FROM appointments a
            JOIN patients p ON a.patient_id = p.id
            JOIN doctors d ON a.doctor_id = d.id
            WHERE a.id = ?
        `, [id]);

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }

        // Check if user has access to this appointment
        let hasAccess = false;
        if (role === 'admin') {
            hasAccess = true;
        } else if (role === 'patient') {
            const patient = await findOne('SELECT id FROM patients WHERE user_id = ?', [userId]);
            hasAccess = patient && patient.id === appointment.patient_id;
        } else if (role === 'doctor') {
            const doctor = await findOne('SELECT id FROM doctors WHERE user_id = ?', [userId]);
            hasAccess = doctor && doctor.id === appointment.doctor_id;
        }

        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                message: 'Access denied to this appointment'
            });
        }

        res.json({
            success: true,
            data: appointment
        });

    } catch (error) {
        console.error('Get appointment error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch appointment',
            error: error.message
        });
    }
};

// Book new appointment
const bookAppointment = async (req, res) => {
    try {
        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }

        const { doctorId, appointmentDate, startTime, type, reason } = req.body;
        const userId = req.user.id;

        // Only patients can book appointments
        if (req.user.role !== 'patient') {
            return res.status(403).json({
                success: false,
                message: 'Only patients can book appointments'
            });
        }

        // Get patient ID
        const patient = await findOne('SELECT id FROM patients WHERE user_id = ?', [userId]);
        if (!patient) {
            return res.status(404).json({
                success: false,
                message: 'Patient profile not found'
            });
        }

        // Verify doctor exists and is approved
        const doctor = await findOne('SELECT id, is_approved FROM doctors WHERE id = ?', [doctorId]);
        if (!doctor) {
            return res.status(404).json({
                success: false,
                message: 'Doctor not found'
            });
        }

        if (!doctor.is_approved) {
            return res.status(400).json({
                success: false,
                message: 'Doctor is not approved to accept appointments'
            });
        }

        // Calculate end time (default 30 minutes)
        const [hours, minutes] = startTime.split(':').map(Number);
        const startMinutes = hours * 60 + minutes;
        const endMinutes = startMinutes + 30; // 30-minute appointment
        const endHours = Math.floor(endMinutes / 60);
        const endMins = endMinutes % 60;
        const endTime = `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;

        // Check for conflicts
        const conflictingAppt = await findOne(`
            SELECT id FROM appointments 
            WHERE doctor_id = ? 
            AND appointment_date = ? 
            AND status NOT IN ('cancelled', 'completed')
            AND (
                (start_time <= ? AND end_time > ?) OR
                (start_time < ? AND end_time >= ?)
            )
        `, [doctorId, appointmentDate, startTime, startTime, endTime, endTime]);

        if (conflictingAppt) {
            return res.status(400).json({
                success: false,
                message: 'This time slot is not available'
            });
        }

        // Insert appointment
        const result = await insertRecord(`
            INSERT INTO appointments 
            (patient_id, doctor_id, appointment_date, start_time, end_time, type, reason, status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled')
        `, [patient.id, doctorId, appointmentDate, startTime, endTime, type, reason]);

        if (!result.success) {
            return res.status(500).json({
                success: false,
                message: 'Failed to book appointment',
                error: result.error
            });
        }

        res.status(201).json({
            success: true,
            message: 'Appointment booked successfully',
            data: {
                appointmentId: result.insertId,
                appointmentDate,
                startTime,
                endTime,
                type,
                reason
            }
        });

    } catch (error) {
        console.error('Book appointment error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to book appointment',
            error: error.message
        });
    }
};

// Update appointment status
const updateAppointmentStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, notes } = req.body;
        const { role, id: userId } = req.user;

        // Validate status
        const validStatuses = ['scheduled', 'confirmed', 'completed', 'cancelled', 'rescheduled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status'
            });
        }

        // Get appointment
        const appointment = await findOne('SELECT * FROM appointments WHERE id = ?', [id]);
        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }

        // Check permissions
        let hasPermission = false;
        if (role === 'admin') {
            hasPermission = true;
        } else if (role === 'doctor') {
            const doctor = await findOne('SELECT id FROM doctors WHERE user_id = ?', [userId]);
            hasPermission = doctor && doctor.id === appointment.doctor_id;
        } else if (role === 'patient' && status === 'cancelled') {
            const patient = await findOne('SELECT id FROM patients WHERE user_id = ?', [userId]);
            hasPermission = patient && patient.id === appointment.patient_id;
        }

        if (!hasPermission) {
            return res.status(403).json({
                success: false,
                message: 'Access denied to update this appointment'
            });
        }

        // Update appointment
        const result = await updateRecord(
            'UPDATE appointments SET status = ?, notes = ? WHERE id = ?',
            [status, notes || appointment.notes, id]
        );

        if (!result.success) {
            return res.status(500).json({
                success: false,
                message: 'Failed to update appointment',
                error: result.error
            });
        }

        res.json({
            success: true,
            message: 'Appointment updated successfully'
        });

    } catch (error) {
        console.error('Update appointment error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update appointment',
            error: error.message
        });
    }
};

// Get available time slots for a doctor
const getAvailableSlots = async (req, res) => {
    try {
        const { doctorId, date } = req.query;

        if (!doctorId || !date) {
            return res.status(400).json({
                success: false,
                message: 'Doctor ID and date are required'
            });
        }

        // Get doctor's schedule for the day
        const dayOfWeek = new Date(date).getDay();
        const schedule = await findOne(`
            SELECT start_time, end_time, break_start_time, break_end_time 
            FROM doctor_schedules 
            WHERE doctor_id = ? AND day_of_week = ? AND is_available = true
        `, [doctorId, dayOfWeek]);

        if (!schedule) {
            return res.json({
                success: true,
                data: [],
                message: 'Doctor is not available on this day'
            });
        }

        // Get existing appointments
        const appointments = await findMany(`
            SELECT start_time, end_time 
            FROM appointments 
            WHERE doctor_id = ? AND appointment_date = ? AND status NOT IN ('cancelled', 'completed')
        `, [doctorId, date]);

        // Generate available slots (30-minute intervals)
        const slots = [];
        const [startHour, startMin] = schedule.start_time.split(':').map(Number);
        const [endHour, endMin] = schedule.end_time.split(':').map(Number);
        
        let currentTime = startHour * 60 + startMin;
        const endTime = endHour * 60 + endMin;

        while (currentTime + 30 <= endTime) {
            const slotStart = `${Math.floor(currentTime / 60).toString().padStart(2, '0')}:${(currentTime % 60).toString().padStart(2, '0')}`;
            const slotEnd = `${Math.floor((currentTime + 30) / 60).toString().padStart(2, '0')}:${((currentTime + 30) % 60).toString().padStart(2, '0')}`;

            // Check if slot conflicts with existing appointments
            const isBooked = appointments.some(apt => {
                return slotStart < apt.end_time && slotEnd > apt.start_time;
            });

            // Check if slot conflicts with break time
            let isDuringBreak = false;
            if (schedule.break_start_time && schedule.break_end_time) {
                isDuringBreak = slotStart < schedule.break_end_time && slotEnd > schedule.break_start_time;
            }

            if (!isBooked && !isDuringBreak) {
                slots.push({
                    startTime: slotStart,
                    endTime: slotEnd,
                    available: true
                });
            }

            currentTime += 30;
        }

        res.json({
            success: true,
            data: slots
        });

    } catch (error) {
        console.error('Get available slots error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get available slots',
            error: error.message
        });
    }
};

module.exports = {
    getAppointments,
    getAppointment,
    bookAppointment,
    updateAppointmentStatus,
    getAvailableSlots,
    bookAppointmentValidation
};