import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        default: ''
    },
    users: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user'
    }],
    // ✅ ADD THIS - Track who owns/created the project
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
        required: true
    },
    fileTree: {
        type: Object,
        default: {}
    }
}, {
    timestamps: true
});

export default mongoose.model('project', projectSchema);