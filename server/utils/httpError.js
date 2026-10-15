// Keep client mistakes distinct from unexpected server failures.
const sendError = (res, error) => {
    if (error.name === 'ValidationError' || error.name === 'CastError') {
        return res.status(400).json({ message: 'Invalid request data' });
    }
    if (error.code === 11000) {
        return res.status(409).json({ message: 'Resource already exists' });
    }
    if ([400, 403, 404, 409, 429, 502].includes(error.status)) {
        if (error.retryAfter) res.set('Retry-After', String(error.retryAfter));
        return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Internal server error' });
};

module.exports = sendError;
