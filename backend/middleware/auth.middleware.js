import jwt from 'jsonwebtoken';
import redisClient from '../services/redis.service.js';

export const authUser = async (req, res, next) => {
    try {
        // BUG FIX: original code crashed with TypeError when req.headers.authorization
        // was undefined because it called .split(' ') unconditionally.
        let token = req.cookies?.token;
        if (!token && req.headers.authorization?.startsWith('Bearer ')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            return res.status(401).json({ error: 'Unauthorized: no token provided' });
        }

        // Check Redis blacklist (tokens invalidated on logout)
        const isBlackListed = await redisClient.get(token);
        if (isBlackListed) {
            res.clearCookie('token');
            return res.status(401).json({ error: 'Unauthorized: token revoked' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        console.error('authUser middleware error:', error.message);
        res.status(401).json({ error: 'Unauthorized: invalid token' });
    }
};
