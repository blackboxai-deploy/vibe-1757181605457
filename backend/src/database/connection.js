const mysql = require('mysql2/promise');
require('dotenv').config();

// Database configuration
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'healthcare_appointments',
    port: process.env.DB_PORT || 3306,
    connectionLimit: 10,
    acquireTimeout: 60000,
    timeout: 60000,
    reconnect: true
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Test database connection
async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Database connected successfully');
        connection.release();
        return true;
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        return false;
    }
}

// Execute query with error handling
async function executeQuery(query, params = []) {
    try {
        const [results] = await pool.execute(query, params);
        return { success: true, data: results };
    } catch (error) {
        console.error('Database query error:', error.message);
        return { success: false, error: error.message };
    }
}

// Get a single record
async function findOne(query, params = []) {
    try {
        const [results] = await pool.execute(query, params);
        return results.length > 0 ? results[0] : null;
    } catch (error) {
        console.error('Database findOne error:', error.message);
        return null;
    }
}

// Get multiple records
async function findMany(query, params = []) {
    try {
        const [results] = await pool.execute(query, params);
        return results;
    } catch (error) {
        console.error('Database findMany error:', error.message);
        return [];
    }
}

// Insert record and return inserted ID
async function insertRecord(query, params = []) {
    try {
        const [result] = await pool.execute(query, params);
        return { success: true, insertId: result.insertId, affectedRows: result.affectedRows };
    } catch (error) {
        console.error('Database insert error:', error.message);
        return { success: false, error: error.message };
    }
}

// Update record
async function updateRecord(query, params = []) {
    try {
        const [result] = await pool.execute(query, params);
        return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
        console.error('Database update error:', error.message);
        return { success: false, error: error.message };
    }
}

// Delete record
async function deleteRecord(query, params = []) {
    try {
        const [result] = await pool.execute(query, params);
        return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
        console.error('Database delete error:', error.message);
        return { success: false, error: error.message };
    }
}

// Initialize database tables
async function initializeDatabase() {
    try {
        // Create users table
        await executeQuery(`
            CREATE TABLE IF NOT EXISTS users (
                id INT PRIMARY KEY AUTO_INCREMENT,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                role ENUM('patient', 'doctor', 'admin') NOT NULL DEFAULT 'patient',
                is_verified BOOLEAN DEFAULT FALSE,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // Create patients table
        await executeQuery(`
            CREATE TABLE IF NOT EXISTS patients (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                first_name VARCHAR(100) NOT NULL,
                last_name VARCHAR(100) NOT NULL,
                phone VARCHAR(20),
                date_of_birth DATE,
                gender ENUM('male', 'female', 'other'),
                address TEXT,
                emergency_contact VARCHAR(100),
                emergency_phone VARCHAR(20),
                blood_type VARCHAR(5),
                allergies TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Create doctors table
        await executeQuery(`
            CREATE TABLE IF NOT EXISTS doctors (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                first_name VARCHAR(100) NOT NULL,
                last_name VARCHAR(100) NOT NULL,
                specialization VARCHAR(100) NOT NULL,
                license_number VARCHAR(50) UNIQUE NOT NULL,
                phone VARCHAR(20),
                bio TEXT,
                experience_years INT DEFAULT 0,
                consultation_fee DECIMAL(10,2) DEFAULT 0.00,
                education TEXT,
                certifications TEXT,
                is_approved BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Create appointments table
        await executeQuery(`
            CREATE TABLE IF NOT EXISTS appointments (
                id INT PRIMARY KEY AUTO_INCREMENT,
                patient_id INT NOT NULL,
                doctor_id INT NOT NULL,
                appointment_date DATE NOT NULL,
                start_time TIME NOT NULL,
                end_time TIME NOT NULL,
                status ENUM('scheduled', 'confirmed', 'completed', 'cancelled', 'rescheduled') DEFAULT 'scheduled',
                type ENUM('in-person', 'virtual') DEFAULT 'in-person',
                reason TEXT,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
                FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE
            )
        `);

        // Create medical records table
        await executeQuery(`
            CREATE TABLE IF NOT EXISTS medical_records (
                id INT PRIMARY KEY AUTO_INCREMENT,
                patient_id INT NOT NULL,
                doctor_id INT NOT NULL,
                appointment_id INT,
                visit_date DATE NOT NULL,
                diagnosis TEXT,
                treatment TEXT,
                prescription TEXT,
                notes TEXT,
                vital_signs JSON,
                attachments JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
                FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
                FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL
            )
        `);

        console.log('✅ Database tables initialized successfully');
        return true;
    } catch (error) {
        console.error('❌ Database initialization failed:', error.message);
        return false;
    }
}

module.exports = {
    pool,
    testConnection,
    executeQuery,
    findOne,
    findMany,
    insertRecord,
    updateRecord,
    deleteRecord,
    initializeDatabase
};