import Redis from 'ioredis';

// BUG FIX: original code had no error handling — if Redis was unreachable,
// the app crashed on first auth middleware call.
// Now we handle reconnect gracefully and fall back to "allow" on Redis errors.

const retryStrategy = (times) => Math.min(times * 500, 30000); // exponential backoff, max 30s

// Some env sources (Docker --env-file, pasting into a dashboard) don't strip
// surrounding quotes the way Node's dotenv does — strip them ourselves so a
// quoted value doesn't get parsed as a literal file path.
const redisUrl = process.env.REDIS_URL?.trim().replace(/^["']|["']$/g, '');

// REDIS_URL (rediss://...) is used for TLS-required providers like Upstash.
// Falls back to plain host/port/password for local Redis, which doesn't need TLS.
const redisClient = redisUrl
    ? new Redis(redisUrl, { retryStrategy, lazyConnect: true, enableReadyCheck: true })
    : new Redis({
        host:     process.env.REDIS_HOST || 'localhost',
        port:     parseInt(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        retryStrategy,
        lazyConnect:      true,
        enableReadyCheck: true
    });

redisClient.on('connect',   () => console.log('✅ Redis connected'));
redisClient.on('ready',     () => console.log('✅ Redis ready'));
redisClient.on('error',     (err) => console.error('❌ Redis error:', err.message));
redisClient.on('reconnecting', () => console.log('🔄 Redis reconnecting...'));

// Connect on startup (lazy — won't throw if unavailable yet)
redisClient.connect().catch(() => {});

export default redisClient;
