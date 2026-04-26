import projectModel from '../models/project.model.js';
import mongoose from 'mongoose';

// ✅ FIX 1: Create project - Add owner field
export const createProject = async ({
    name, userId
}) => {
    if (!name) {
        throw new Error('Name is required')
    }
    if (!userId) {
        throw new Error('UserId is required')
    }

    let project;
    try {
        project = await projectModel.create({
            name,
            owner: userId,        // ✅ ADD THIS - Set the creator as owner
            users: [ userId ]     // ✅ Keep this - Add creator to users array
        });
    } catch (error) {
        if (error.code === 11000) {
            throw new Error('Project name already exists');
        }
        throw error;
    }

    return project;
}

// ✅ GOOD: Get all projects by user ID (already filtered by users array)
export const getAllProjectByUserId = async ({ userId }) => {
    if (!userId) {
        throw new Error('UserId is required')
    }

    const allUserProjects = await projectModel.find({
        users: userId
    }).populate('users', 'email _id')
      .populate('owner', 'email _id');    // ✅ ADD THIS - Populate owner info

    return allUserProjects;
}

// ✅ FIX 2: Add users to project - Remove userId check (we'll do it in controller)
// ✅ FIX: Remove userId parameter (owner check done in controller)
export const addUsersToProject = async ({ projectId, users }) => {
    if (!projectId) {
        throw new Error("projectId is required")
    }

    if (!mongoose.Types.ObjectId.isValid(projectId)) {
        throw new Error("Invalid projectId")
    }

    if (!users) {
        throw new Error("users are required")
    }

    if (!Array.isArray(users) || users.some(userId => !mongoose.Types.ObjectId.isValid(userId))) {
        throw new Error("Invalid userId(s) in users array")
    }

    const updatedProject = await projectModel.findOneAndUpdate({
        _id: projectId
    }, {
        $addToSet: {
            users: {
                $each: users
            }
        }
    }, {
        new: true
    }).populate('users', 'email _id')
      .populate('owner', 'email _id');

    return updatedProject;
}

// ✅ FIX 3: Get project by ID - Add access check parameter
export const getProjectById = async ({ projectId, userId }) => {
    if (!projectId) {
        throw new Error("projectId is required")
    }

    if (!mongoose.Types.ObjectId.isValid(projectId)) {
        throw new Error("Invalid projectId")
    }

    // ✅ MODIFIED: Only return project if user has access
    const query = userId 
        ? { _id: projectId, users: userId }  // Check access if userId provided
        : { _id: projectId };                // No access check if no userId

    const project = await projectModel.findOne(query)
        .populate('users', 'email _id')
        .populate('owner', 'email _id');     // ✅ ADD THIS - Populate owner info

    return project;
}

// ✅ FIX 4: Update file tree - Add access check parameter
export const updateFileTree = async ({ projectId, fileTree, userId }) => {
    if (!projectId) {
        throw new Error("projectId is required")
    }

    if (!mongoose.Types.ObjectId.isValid(projectId)) {
        throw new Error("Invalid projectId")
    }

    if (!fileTree) {
        throw new Error("fileTree is required")
    }

    // ✅ ADDED: Check if user has access before updating
    if (userId) {
        const project = await projectModel.findOne({
            _id: projectId,
            users: userId
        });

        if (!project) {
            throw new Error("You do not have access to this project");
        }
    }

    const project = await projectModel.findOneAndUpdate({
        _id: projectId
    }, {
        fileTree
    }, {
        new: true
    }).populate('users', 'email _id')
      .populate('owner', 'email _id');      // ✅ ADD THIS - Populate owner info

    return project;
}