const jwt = require('jsonwebtoken');
const { findOne } = require('../database/connection');

// Verify JWT token
const verifyToken = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Access denied. No token provided.'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Get user from database to ensure they still exist and are active
        const user = await findOne(
            'SELECT id, email, role, is_active FROM users WHERE id = ?',
            [decoded.userId]
        );

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid token. User not found.'
            });
        }

        if (!user.is_active) {
            return res.status(401).json({
                success: false,
                message: 'Account is deactivated.'
            });
        }

        req.user = user;
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid token.'
            });
        }
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expired.'
            });
        }

        return res.status(500).json({
            success: false,
            message: 'Token verification failed.',
            error: error.message
        });
    }
};

// Check if user has required role
const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required.'
            });
        }

        // Convert single role to array
        const allowedRoles = Array.isArray(roles) ? roles : [roles];

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Access denied. Required role: ${allowedRoles.join(' or ')}`
            });
        }

        next();
    };
};

// Middleware combinations for common use cases
const requireAuth = verifyToken;
const requirePatient = [verifyToken, requireRole('patient')];
const requireDoctor = [verifyToken, requireRole('doctor')];
const requireAdmin = [verifyToken, requireRole('admin')];
const requireDoctorOrAdmin = [verifyToken, requireRole(['doctor', 'admin'])];

module.exports = {
    verifyToken,
    requireRole,
    requireAuth,
    requirePatient,
    requireDoctor,
    requireAdmin,
    requireDoctorOrAdmin
};