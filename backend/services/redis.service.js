import Redis from 'ioredis';

// BUG FIX: original code had no error handling — if Redis was unreachable,
// the app crashed on first auth middleware call.
// Now we handle reconnect gracefully and fall back to "allow" on Redis errors.

const redisClient = new Redis({
    host:       process.env.REDIS_HOST     || 'localhost',
    port:       parseInt(process.env.REDIS_PORT) || 6379,
    password:   process.env.REDIS_PASSWORD || undefined,
    retryStrategy: (times) => {
        // Retry with exponential backoff, max 30s
        return Math.min(times * 500, 30000);
    },
    lazyConnect:   true,
    enableReadyCheck: true
});

redisClient.on('connect',   () => console.log('✅ Redis connected'));
redisClient.on('ready',     () => console.log('✅ Redis ready'));
redisClient.on('error',     (err) => console.error('❌ Redis error:', err.message));
redisClient.on('reconnecting', () => console.log('🔄 Redis reconnecting...'));

// Connect on startup (lazy — won't throw if unavailable yet)
redisClient.connect().catch(() => {});

export default redisClient;
