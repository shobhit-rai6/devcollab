// backend/controllers/project.controller.js
import projectModel from '../models/project.model.js';
import messageModel from '../models/message.model.js';   // ← NEW
import * as projectService from '../services/project.service.js';
import userModel from '../models/user.model.js';
import { validationResult } from 'express-validator';

// ── Existing controllers (unchanged) ─────────────────────────────────────────

export const createProject = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
        const { name } = req.body;
        const loggedInUser = await userModel.findOne({ email: req.user.email });
        const userId = loggedInUser._id;
        const newProject = await projectService.createProject({ name, userId, owner: userId });
        res.status(201).json(newProject);
    } catch (err) {
        console.log(err);
        res.status(400).send(err.message);
    }
}

export const getAllProject = async (req, res) => {
    try {
        const loggedInUser = await userModel.findOne({ email: req.user.email });
        const allUserProjects = await projectService.getAllProjectByUserId({ userId: loggedInUser._id });
        return res.status(200).json({ projects: allUserProjects });
    } catch (err) {
        console.log(err);
        res.status(400).json({ error: err.message });
    }
}

export const addUserToProject = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
        const { projectId, users } = req.body;
        const loggedInUser = await userModel.findOne({ email: req.user.email });
        const project = await projectModel.findOne({ _id: projectId, owner: loggedInUser._id });
        if (!project) return res.status(403).json({ error: 'Only project owner can add collaborators' });
        const updatedProject = await projectService.addUsersToProject({ projectId, users, userId: loggedInUser._id });
        return res.status(200).json({ project: updatedProject });
    } catch (err) {
        console.log(err);
        res.status(400).json({ error: err.message });
    }
}

export const getProjectById = async (req, res) => {
    const { projectId } = req.params;
    try {
        const loggedInUser = await userModel.findOne({ email: req.user.email });
        const project = await projectModel.findOne({ _id: projectId, users: loggedInUser._id });
        if (!project) return res.status(404).json({ error: 'Project not found or you do not have access' });
        return res.status(200).json({ project });
    } catch (err) {
        console.log(err);
        res.status(400).json({ error: err.message });
    }
}

export const updateFileTree = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
        const { projectId, fileTree } = req.body;
        const loggedInUser = await userModel.findOne({ email: req.user.email });
        const project = await projectModel.findOne({ _id: projectId, users: loggedInUser._id });
        if (!project) return res.status(403).json({ error: 'You do not have access to this project' });
        const updatedProject = await projectService.updateFileTree({ projectId, fileTree });
        return res.status(200).json({ project: updatedProject });
    } catch (err) {
        console.log(err);
        res.status(400).json({ error: err.message });
    }
}

// ── NEW: Save messages ────────────────────────────────────────────────────────
// POST /projects/messages
export const saveMessages = async (req, res) => {
    try {
        const { projectId, messages } = req.body;
        if (!projectId || !Array.isArray(messages) || messages.length === 0)
            return res.status(400).json({ error: 'projectId and messages array required' });

        const loggedInUser = await userModel.findOne({ email: req.user.email });
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
        console.error('saveMessages error:', err);
        res.status(500).json({ error: err.message });
    }
}

// ── NEW: Get chat history ─────────────────────────────────────────────────────
// GET /projects/:projectId/messages
export const getMessages = async (req, res) => {
    try {
        const { projectId } = req.params;
        const limit = Math.min(parseInt(req.query.limit) || 200, 500);

        const loggedInUser = await userModel.findOne({ email: req.user.email });
        const project = await projectModel.findOne({ _id: projectId, users: loggedInUser._id });
        if (!project) return res.status(403).json({ error: 'Access denied' });

        const msgs = await messageModel
            .find({ project: projectId })
            .sort({ createdAt: 1 })
            .limit(limit)
            .lean();

        return res.status(200).json({ messages: msgs });
    } catch (err) {
        console.error('getMessages error:', err);
        res.status(500).json({ error: err.message });
    }
}

// ── NEW: Delete project (owner only) ─────────────────────────────────────────
// DELETE /projects/:projectId
export const deleteProject = async (req, res) => {
    try {
        const { projectId } = req.params;
        const loggedInUser = await userModel.findOne({ email: req.user.email });
        const project = await projectModel.findOne({ _id: projectId, owner: loggedInUser._id });
        if (!project) return res.status(403).json({ error: 'Only the project owner can delete this project' });

        await projectModel.deleteOne({ _id: projectId });
        await messageModel.deleteMany({ project: projectId });

        return res.status(200).json({ message: 'Project deleted' });
    } catch (err) {
        console.error('deleteProject error:', err);
        res.status(500).json({ error: err.message });
    }
}