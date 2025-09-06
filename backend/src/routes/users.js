const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { findMany, findOne } = require('../database/connection');

const router = express.Router();

/**
 * @route   GET /api/users/doctors
 * @desc    Get list of approved doctors
 * @access  Private
 */
router.get('/doctors', requireAuth, async (req, res) => {
    try {
        const { specialization } = req.query;
        
        let query = `
            SELECT 
                d.id,
                d.first_name,
                d.last_name,
                d.specialization,
                d.bio,
                d.experience_years,
                d.consultation_fee,
                u.email
            FROM doctors d
            JOIN users u ON d.user_id = u.id
            WHERE d.is_approved = true AND u.is_active = true
        `;
        
        let params = [];
        
        if (specialization) {
            query += ' AND d.specialization = ?';
            params.push(specialization);
        }
        
        query += ' ORDER BY d.first_name, d.last_name';
        
        const doctors = await findMany(query, params);
        
        res.json({
            success: true,
            data: doctors
        });
        
    } catch (error) {
        console.error('Get doctors error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch doctors',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/users/specializations
 * @desc    Get list of available specializations
 * @access  Private
 */
router.get('/specializations', requireAuth, async (req, res) => {
    try {
        const specializations = await findMany(`
            SELECT DISTINCT specialization
            FROM doctors
            WHERE is_approved = true
            ORDER BY specialization
        `);
        
        res.json({
            success: true,
            data: specializations.map(s => s.specialization)
        });
        
    } catch (error) {
        console.error('Get specializations error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch specializations',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/users/doctor/:id
 * @desc    Get doctor details
 * @access  Private
 */
router.get('/doctor/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        
        const doctor = await findOne(`
            SELECT 
                d.*,
                u.email,
                u.is_active
            FROM doctors d
            JOIN users u ON d.user_id = u.id
            WHERE d.id = ? AND d.is_approved = true AND u.is_active = true
        `, [id]);
        
        if (!doctor) {
            return res.status(404).json({
                success: false,
                message: 'Doctor not found'
            });
        }
        
        res.json({
            success: true,
            data: doctor
        });
        
    } catch (error) {
        console.error('Get doctor error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch doctor details',
            error: error.message
        });
    }
});

module.exports = router;