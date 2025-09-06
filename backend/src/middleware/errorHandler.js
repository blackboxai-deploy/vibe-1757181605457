// Global error handler middleware
const errorHandler = (error, req, res, next) => {
    let statusCode = error.statusCode || 500;
    let message = error.message || 'Internal Server Error';

    // Mongoose validation error
    if (error.name === 'ValidationError') {
        statusCode = 400;
        message = Object.values(error.errors).map(err => err.message).join(', ');
    }

    // MySQL duplicate entry error
    if (error.code === 'ER_DUP_ENTRY') {
        statusCode = 400;
        message = 'Duplicate entry. Record already exists.';
    }

    // MySQL foreign key constraint error
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
        statusCode = 400;
        message = 'Referenced record does not exist.';
    }

    // JWT errors
    if (error.name === 'JsonWebTokenError') {
        statusCode = 401;
        message = 'Invalid token';
    }

    if (error.name === 'TokenExpiredError') {
        statusCode = 401;
        message = 'Token expired';
    }

    // Log error for debugging
    console.error('Error:', {
        message: error.message,
        stack: error.stack,
        url: req.originalUrl,
        method: req.method,
        ip: req.ip,
        timestamp: new Date().toISOString()
    });

    res.status(statusCode).json({
        success: false,
        message,
        ...(process.env.NODE_ENV === 'development' && {
            error: error.message,
            stack: error.stack
        })
    });
};

module.exports = errorHandler;