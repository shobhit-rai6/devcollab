import projectModel from '../models/project.model.js';
import * as projectService from '../services/project.service.js';
import userModel from '../models/user.model.js';
import { validationResult } from 'express-validator';

// ✅ FIX 1: Create project - Add owner and add creator to users array
export const createProject = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { name } = req.body;
        const loggedInUser = await userModel.findOne({ email: req.user.email });
        const userId = loggedInUser._id;

        // ✅ Pass userId to service to set as owner AND add to users array
        const newProject = await projectService.createProject({ 
            name, 
            userId,  // This will be used as owner AND added to users array
            owner: userId // Explicitly pass owner
        });

        res.status(201).json(newProject);
    } catch (err) {
        console.log(err);
        res.status(400).send(err.message);
    }
}

// ✅ FIX 2: Get all projects - Already filtered by userId (Good!)
export const getAllProject = async (req, res) => {
    try {
        const loggedInUser = await userModel.findOne({
            email: req.user.email
        });

        const allUserProjects = await projectService.getAllProjectByUserId({
            userId: loggedInUser._id
        });

        return res.status(200).json({
            projects: allUserProjects
        });
    } catch (err) {
        console.log(err);
        res.status(400).json({ error: err.message });
    }
}

// ✅ FIX 3: Add user to project - Only owner can add
export const addUserToProject = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { projectId, users } = req.body;
        const loggedInUser = await userModel.findOne({
            email: req.user.email
        });

        // ✅ Step 1: Check if current user is the OWNER
        const project = await projectModel.findOne({
            _id: projectId,
            owner: loggedInUser._id  // Only owner can add collaborators
        });

        if (!project) {
            return res.status(403).json({ 
                error: 'Only project owner can add collaborators' 
            });
        }

        // ✅ Step 2: Add users to project
        const updatedProject = await projectService.addUsersToProject({
            projectId,
            users,
            userId: loggedInUser._id
        });

        return res.status(200).json({
            project: updatedProject
        });
    } catch (err) {
        console.log(err);
        res.status(400).json({ error: err.message });
    }
}

// ✅ FIX 4: Get project by ID - Add access check
export const getProjectById = async (req, res) => {
    const { projectId } = req.params;

    try {
        const loggedInUser = await userModel.findOne({
            email: req.user.email
        });

        // ✅ Check if user has access to this project
        const project = await projectModel.findOne({
            _id: projectId,
            users: loggedInUser._id  // User must be in users array
        });

        if (!project) {
            return res.status(404).json({ 
                error: 'Project not found or you do not have access' 
            });
        }

        return res.status(200).json({
            project
        });
    } catch (err) {
        console.log(err);
        res.status(400).json({ error: err.message });
    }
}

// ✅ FIX 5: Update file tree - Add access check
export const updateFileTree = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { projectId, fileTree } = req.body;
        const loggedInUser = await userModel.findOne({
            email: req.user.email
        });

        // ✅ Check if user has access to this project
        const project = await projectModel.findOne({
            _id: projectId,
            users: loggedInUser._id  // User must be in users array
        });

        if (!project) {
            return res.status(403).json({ 
                error: 'You do not have access to this project' 
            });
        }

        // ✅ Update file tree
        const updatedProject = await projectService.updateFileTree({
            projectId,
            fileTree
        });

        return res.status(200).json({
            project: updatedProject
        });
    } catch (err) {
        console.log(err);
        res.status(400).json({ error: err.message });
    }
}