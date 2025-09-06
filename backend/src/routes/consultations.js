const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Placeholder for consultation routes
router.get('/', requireAuth, (req, res) => {
    res.json({
        success: true,
        message: 'Consultations endpoint - Coming soon',
        data: []
    });
});

module.exports = router;