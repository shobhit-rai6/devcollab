import projectModel from '../models/project.model.js';
import mongoose from 'mongoose';

// ── Create project ────────────────────────────────────────────────────────────
export const createProject = async ({ name, userId }) => {
    if (!name?.trim()) throw new Error('Name is required');
    if (!userId)       throw new Error('UserId is required');

    try {
        const project = await projectModel.create({
            name: name.trim(),
            owner: userId,   // BUG FIX: was missing in some versions
            users: [userId]
        });
        return project.populate(['users', 'owner']);
    } catch (error) {
        if (error.code === 11000) throw new Error('A project with that name already exists');
        throw error;
    }
};

// ── Get all projects for a user ───────────────────────────────────────────────
export const getAllProjectByUserId = async ({ userId }) => {
    if (!userId) throw new Error('UserId is required');
    return projectModel
        .find({ users: userId })
        .populate('users', 'email _id')
        .populate('owner', 'email _id')   // BUG FIX: populate owner so frontend can show ownership badge
        .sort({ updatedAt: -1 });
};

// ── Add collaborators ─────────────────────────────────────────────────────────
// BUG FIX: removed the unused userId parameter that was causing "userId required"
// errors when callers only passed { projectId, users }
export const addUsersToProject = async ({ projectId, users }) => {
    if (!projectId) throw new Error('projectId is required');
    if (!mongoose.Types.ObjectId.isValid(projectId)) throw new Error('Invalid projectId');
    if (!Array.isArray(users) || users.length === 0) throw new Error('users array is required');
    if (users.some(id => !mongoose.Types.ObjectId.isValid(id)))
        throw new Error('One or more user IDs are invalid');

    const updated = await projectModel.findByIdAndUpdate(
        projectId,
        { $addToSet: { users: { $each: users } } },
        { new: true }
    )
        .populate('users', 'email _id')
        .populate('owner', 'email _id');

    if (!updated) throw new Error('Project not found');
    return updated;
};

// ── Get project by ID ─────────────────────────────────────────────────────────
export const getProjectById = async ({ projectId, userId }) => {
    if (!projectId) throw new Error('projectId is required');
    if (!mongoose.Types.ObjectId.isValid(projectId)) throw new Error('Invalid projectId');

    const query = userId ? { _id: projectId, users: userId } : { _id: projectId };
    return projectModel
        .findOne(query)
        .populate('users', 'email _id')
        .populate('owner', 'email _id');
};

// ── Update file tree ──────────────────────────────────────────────────────────
export const updateFileTree = async ({ projectId, fileTree }) => {
    if (!projectId) throw new Error('projectId is required');
    if (!mongoose.Types.ObjectId.isValid(projectId)) throw new Error('Invalid projectId');
    if (!fileTree)  throw new Error('fileTree is required');

    const updated = await projectModel.findByIdAndUpdate(
        projectId,
        { fileTree },
        { new: true }
    )
        .populate('users', 'email _id')
        .populate('owner', 'email _id');

    if (!updated) throw new Error('Project not found');
    return updated;
};
