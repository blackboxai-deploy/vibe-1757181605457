const express = require('express');
const { requireAuth, requireDoctorOrAdmin } = require('../middleware/auth');

const router = express.Router();

// Placeholder for medical records routes
router.get('/', requireAuth, (req, res) => {
    res.json({
        success: true,
        message: 'Medical records endpoint - Coming soon',
        data: []
    });
});

module.exports = router;