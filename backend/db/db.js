import mongoose from 'mongoose';

function connect() {
    // BUG FIX: original code had no MONGODB_URI fallback and swallowed
    // the error silently. Now we throw on missing URI and log properly.
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('❌ MONGODB_URI is not set in environment variables');
        process.exit(1);
    }

    mongoose.connect(uri, {
        serverSelectionTimeoutMS: 5000
    })
        .then(() => console.log('✅ Connected to MongoDB'))
        .catch(err => {
            console.error('❌ MongoDB connection failed:', err.message);
            process.exit(1);
        });

    mongoose.connection.on('disconnected', () =>
        console.warn('⚠️  MongoDB disconnected — attempting reconnect')
    );
}

export default connect;
