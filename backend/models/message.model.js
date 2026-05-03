// backend/models/message.model.js
import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'project', required: true, index: true },
    sender:  { _id: { type: String, required: true }, email: { type: String, required: true } },
    message: { type: String, required: true },
    type:    { type: String, enum: ['user', 'ai'], default: 'user' }
}, { timestamps: true });

messageSchema.index({ project: 1, createdAt: 1 });
export default mongoose.model('message', messageSchema);