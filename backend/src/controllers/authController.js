const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { findOne, insertRecord, updateRecord } = require('../database/connection');

// Generate JWT token
const generateToken = (userId, email, role) => {
    return jwt.sign(
        { userId, email, role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE || '24h' }
    );
};

// Register validation rules
const registerValidation = [
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Please provide a valid email'),
    body('password')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters long')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
    body('role')
        .isIn(['patient', 'doctor'])
        .withMessage('Role must be either patient or doctor'),
    body('firstName')
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('First name must be between 2 and 50 characters'),
    body('lastName')
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('Last name must be between 2 and 50 characters'),
    body('phone')
        .optional()
        .isMobilePhone()
        .withMessage('Please provide a valid phone number'),
];

// Login validation rules
const loginValidation = [
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Please provide a valid email'),
    body('password')
        .notEmpty()
        .withMessage('Password is required')
];

// Register user
const register = async (req, res) => {
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

        const { email, password, role, firstName, lastName, phone, specialization, licenseNumber } = req.body;

        // Check if user already exists
        const existingUser = await findOne('SELECT id FROM users WHERE email = ?', [email]);
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'User with this email already exists'
            });
        }

        // Hash password
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Insert user
        const userResult = await insertRecord(
            'INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)',
            [email, passwordHash, role]
        );

        if (!userResult.success) {
            return res.status(500).json({
                success: false,
                message: 'Failed to create user account',
                error: userResult.error
            });
        }

        const userId = userResult.insertId;

        // Insert role-specific profile
        let profileResult;
        if (role === 'patient') {
            profileResult = await insertRecord(
                'INSERT INTO patients (user_id, first_name, last_name, phone) VALUES (?, ?, ?, ?)',
                [userId, firstName, lastName, phone || null]
            );
        } else if (role === 'doctor') {
            if (!specialization || !licenseNumber) {
                return res.status(400).json({
                    success: false,
                    message: 'Specialization and license number are required for doctors'
                });
            }

            profileResult = await insertRecord(
                'INSERT INTO doctors (user_id, first_name, last_name, phone, specialization, license_number) VALUES (?, ?, ?, ?, ?, ?)',
                [userId, firstName, lastName, phone || null, specialization, licenseNumber]
            );
        }

        if (!profileResult.success) {
            return res.status(500).json({
                success: false,
                message: 'Failed to create user profile',
                error: profileResult.error
            });
        }

        // Generate token
        const token = generateToken(userId, email, role);

        res.status(201).json({
            success: true,
            message: 'Account created successfully',
            data: {
                token,
                user: {
                    id: userId,
                    email,
                    role,
                    firstName,
                    lastName
                }
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Registration failed',
            error: error.message
        });
    }
};

// Login user
const login = async (req, res) => {
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

        const { email, password } = req.body;

        // Find user
        const user = await findOne(
            'SELECT id, email, password_hash, role, is_active FROM users WHERE email = ?',
            [email]
        );

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Check if account is active
        if (!user.is_active) {
            return res.status(401).json({
                success: false,
                message: 'Account is deactivated. Please contact support.'
            });
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Get user profile
        let profile = null;
        if (user.role === 'patient') {
            profile = await findOne(
                'SELECT first_name, last_name, phone FROM patients WHERE user_id = ?',
                [user.id]
            );
        } else if (user.role === 'doctor') {
            profile = await findOne(
                'SELECT first_name, last_name, phone, specialization, is_approved FROM doctors WHERE user_id = ?',
                [user.id]
            );
        }

        // Generate token
        const token = generateToken(user.id, user.email, user.role);

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    role: user.role,
                    firstName: profile?.first_name,
                    lastName: profile?.last_name,
                    phone: profile?.phone,
                    ...(user.role === 'doctor' && {
                        specialization: profile?.specialization,
                        isApproved: profile?.is_approved
                    })
                }
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed',
            error: error.message
        });
    }
};

// Get current user
const getMe = async (req, res) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;

        let profile = null;
        if (userRole === 'patient') {
            profile = await findOne(
                'SELECT first_name, last_name, phone, date_of_birth, gender, address, blood_type, allergies FROM patients WHERE user_id = ?',
                [userId]
            );
        } else if (userRole === 'doctor') {
            profile = await findOne(
                'SELECT first_name, last_name, phone, specialization, license_number, bio, experience_years, consultation_fee, is_approved FROM doctors WHERE user_id = ?',
                [userId]
            );
        }

        res.json({
            success: true,
            data: {
                id: userId,
                email: req.user.email,
                role: userRole,
                ...profile
            }
        });

    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get user profile',
            error: error.message
        });
    }
};

// Logout (client-side token removal)
const logout = async (req, res) => {
    res.json({
        success: true,
        message: 'Logout successful. Please remove the token from client storage.'
    });
};

module.exports = {
    register,
    login,
    logout,
    getMe,
    registerValidation,
    loginValidation
};