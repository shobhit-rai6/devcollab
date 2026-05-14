import projectModel from '../models/project.model.js';
import messageModel  from '../models/message.model.js';
import * as projectService from '../services/project.service.js';
import userModel from '../models/user.model.js';
import { validationResult } from 'express-validator';
import mongoose from 'mongoose';

// ── Helper: resolve logged-in user from email in JWT ─────────────────────────
// BUG FIX: Every controller was fetching the user by email separately.
// Centralised here to reduce duplication and N+1 queries.
async function resolveUser(req) {
    const user = await userModel.findOne({ email: req.user.email }).lean();
    if (!user) throw new Error('User not found');
    return user;
}

// ── Create project ────────────────────────────────────────────────────────────
export const createProject = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
        const loggedInUser = await resolveUser(req);
        const { name } = req.body;
        const newProject = await projectService.createProject({ name, userId: loggedInUser._id });
        res.status(201).json(newProject);
    } catch (err) {
        console.error('createProject:', err.message);
        res.status(400).send(err.message);
    }
};

// ── Get all projects for the logged-in user ───────────────────────────────────
export const getAllProject = async (req, res) => {
    try {
        const loggedInUser = await resolveUser(req);
        const allUserProjects = await projectService.getAllProjectByUserId({ userId: loggedInUser._id });
        return res.status(200).json({ projects: allUserProjects });
    } catch (err) {
        console.error('getAllProject:', err.message);
        res.status(400).json({ error: err.message });
    }
};

// ── Add collaborator(s) ───────────────────────────────────────────────────────
export const addUserToProject = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
        const { projectId, users } = req.body;
        const loggedInUser = await resolveUser(req);

        // Only the owner can add collaborators
        const project = await projectModel.findOne({ _id: projectId, owner: loggedInUser._id });
        if (!project) return res.status(403).json({ error: 'Only the project owner can add collaborators' });

        // BUG FIX: prevent adding the owner to users array again
        const filteredUsers = users.filter(id => id !== loggedInUser._id.toString());

        const updatedProject = await projectService.addUsersToProject({
            projectId,
            users: filteredUsers,
            userId: loggedInUser._id
        });
        return res.status(200).json({ project: updatedProject });
    } catch (err) {
        console.error('addUserToProject:', err.message);
        res.status(400).json({ error: err.message });
    }
};

// ── Get single project ────────────────────────────────────────────────────────
export const getProjectById = async (req, res) => {
    const { projectId } = req.params;
    // BUG FIX: validate ObjectId before hitting the DB (prevents CastError 500)
    if (!mongoose.Types.ObjectId.isValid(projectId))
        return res.status(400).json({ error: 'Invalid project ID' });
    try {
        const loggedInUser = await resolveUser(req);
        const project = await projectModel
            .findOne({ _id: projectId, users: loggedInUser._id })
            .populate('users', 'email _id')
            .populate('owner', 'email _id');
        if (!project) return res.status(404).json({ error: 'Project not found or access denied' });
        return res.status(200).json({ project });
    } catch (err) {
        console.error('getProjectById:', err.message);
        res.status(400).json({ error: err.message });
    }
};

// ── Update file tree ──────────────────────────────────────────────────────────
export const updateFileTree = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
        const { projectId, fileTree } = req.body;
        const loggedInUser = await resolveUser(req);
        const project = await projectModel.findOne({ _id: projectId, users: loggedInUser._id });
        if (!project) return res.status(403).json({ error: 'Access denied' });
        const updatedProject = await projectService.updateFileTree({ projectId, fileTree });
        return res.status(200).json({ project: updatedProject });
    } catch (err) {
        console.error('updateFileTree:', err.message);
        res.status(400).json({ error: err.message });
    }
};

// ── Save chat messages (batch) ────────────────────────────────────────────────
export const saveMessages = async (req, res) => {
    try {
        const { projectId, messages } = req.body;
        if (!projectId || !Array.isArray(messages) || messages.length === 0)
            return res.status(400).json({ error: 'projectId and messages array required' });

        // BUG FIX: validate ObjectId before DB call
        if (!mongoose.Types.ObjectId.isValid(projectId))
            return res.status(400).json({ error: 'Invalid project ID' });

        const loggedInUser = await resolveUser(req);
        const project = await projectModel.findOne({ _id: projectId, users: loggedInUser._id });
        if (!project) return res.status(403).json({ error: 'Access denied' });

        const docs = messages.map(m => ({
            project: projectId,
            sender:  m.sender,
            message: m.message,
            type:    m.sender?._id === 'ai' ? 'ai' : 'user'
        }));
        await messageModel.insertMany(docs, { ordered: false });
        return res.status(200).json({ saved: docs.length });
    } catch (err) {
        console.error('saveMessages:', err.message);
        res.status(500).json({ error: err.message });
    }
};

// ── Get chat history ──────────────────────────────────────────────────────────
export const getMessages = async (req, res) => {
    try {
        const { projectId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(projectId))
            return res.status(400).json({ error: 'Invalid project ID' });

        // BUG FIX: cap limit to prevent huge payload DoS
        const limit = Math.min(parseInt(req.query.limit) || 200, 500);
        const before = req.query.before; // cursor-based pagination

        const loggedInUser = await resolveUser(req);
        const project = await projectModel.findOne({ _id: projectId, users: loggedInUser._id });
        if (!project) return res.status(403).json({ error: 'Access denied' });

        const query = { project: projectId };
        if (before && mongoose.Types.ObjectId.isValid(before)) {
            query._id = { $lt: new mongoose.Types.ObjectId(before) };
        }

        const msgs = await messageModel
            .find(query)
            .sort({ createdAt: 1 })
            .limit(limit)
            .lean();
        return res.status(200).json({ messages: msgs });
    } catch (err) {
        console.error('getMessages:', err.message);
        res.status(500).json({ error: err.message });
    }
};

// ── Delete project (owner only) ───────────────────────────────────────────────
export const deleteProject = async (req, res) => {
    try {
        const { projectId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(projectId))
            return res.status(400).json({ error: 'Invalid project ID' });

        const loggedInUser = await resolveUser(req);
        const project = await projectModel.findOne({ _id: projectId, owner: loggedInUser._id });
        if (!project) return res.status(403).json({ error: 'Only the project owner can delete this project' });

        // Delete project + all its messages atomically
        await Promise.all([
            projectModel.deleteOne({ _id: projectId }),
            messageModel.deleteMany({ project: projectId })
        ]);
        return res.status(200).json({ message: 'Project deleted successfully' });
    } catch (err) {
        console.error('deleteProject:', err.message);
        res.status(500).json({ error: err.message });
    }
};

// ── Remove collaborator (owner only) ─────────────────────────────────────────
// NEW FEATURE: let the owner kick a collaborator from the project
export const removeCollaborator = async (req, res) => {
    try {
        const { projectId, userId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(projectId) || !mongoose.Types.ObjectId.isValid(userId))
            return res.status(400).json({ error: 'Invalid ID' });

        const loggedInUser = await resolveUser(req);
        const project = await projectModel.findOne({ _id: projectId, owner: loggedInUser._id });
        if (!project) return res.status(403).json({ error: 'Only the owner can remove collaborators' });

        // Cannot remove yourself (owner)
        if (userId === loggedInUser._id.toString())
            return res.status(400).json({ error: 'Owner cannot remove themselves' });

        await projectModel.findByIdAndUpdate(projectId, { $pull: { users: userId } });
        return res.status(200).json({ message: 'Collaborator removed' });
    } catch (err) {
        console.error('removeCollaborator:', err.message);
        res.status(500).json({ error: err.message });
    }
};

// ── Rename project (owner only) ───────────────────────────────────────────────
// NEW FEATURE: rename a project
export const renameProject = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
        const { projectId } = req.params;
        const { name } = req.body;
        if (!mongoose.Types.ObjectId.isValid(projectId))
            return res.status(400).json({ error: 'Invalid project ID' });

        const loggedInUser = await resolveUser(req);
        const project = await projectModel.findOneAndUpdate(
            { _id: projectId, owner: loggedInUser._id },
            { name },
            { new: true }
        ).populate('users', 'email _id').populate('owner', 'email _id');

        if (!project) return res.status(403).json({ error: 'Only the owner can rename this project' });
        return res.status(200).json({ project });
    } catch (err) {
        console.error('renameProject:', err.message);
        res.status(400).json({ error: err.message });
    }
};
