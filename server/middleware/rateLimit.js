// Per-process IP limits supplement the database-backed per-account OTP limits.
const rateLimit = ({ limit, windowMs, now = Date.now }) => {
    const clients = new Map();
    return (req, res, next) => {
        const time = now();
        for (const [key, value] of clients) {
            if (value.resetAt <= time) clients.delete(key);
        }
        const key = req.ip || req.socket?.remoteAddress || 'unknown';
        const current = clients.get(key) || { count: 0, resetAt: time + windowMs };
        // Bound memory even if an attacker uses many source addresses.
        if (!clients.has(key) && clients.size >= 10000) {
            res.set('Retry-After', String(Math.ceil(windowMs / 1000)));
            return res.status(429).json({ message: 'Too many requests. Please try again later.' });
        }
        current.count += 1;
        clients.set(key, current);
        if (current.count > limit) {
            res.set('Retry-After', String(Math.ceil((current.resetAt - time) / 1000)));
            return res.status(429).json({ message: 'Too many requests. Please try again later.' });
        }
        next();
    };
};
module.exports = rateLimit;
