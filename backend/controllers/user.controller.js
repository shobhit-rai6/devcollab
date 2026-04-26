import userModel from '../models/user.model.js';
import projectModel from '../models/project.model.js';
import mongoose from 'mongoose'; // ✅ ADD THIS
import * as userService from '../services/user.service.js';
import { validationResult } from 'express-validator';
import redisClient from '../services/redis.service.js';

export const createUserController = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    try {
        const user = await userService.createUser(req.body);
        const token = await user.generateJWT();
        delete user._doc.password;
        res.status(201).json({ user, token });
    } catch (error) {
        res.status(400).send(error.message);
    }
};

export const loginController = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    try {
        const { email, password } = req.body;
        const user = await userModel.findOne({ email }).select('+password');
        if (!user) {
            return res.status(401).json({ errors: 'Invalid credentials' });
        }
        const isMatch = await user.isValidPassword(password);
        if (!isMatch) {
            return res.status(401).json({ errors: 'Invalid credentials' });
        }
        const token = await user.generateJWT();
        delete user._doc.password;
        res.status(200).json({ user, token });
    } catch (err) {
        console.log(err);
        res.status(400).send(err.message);
    }
};

export const profileController = async (req, res) => {
    res.status(200).json({ user: req.user });
};

export const logoutController = async (req, res) => {
    try {
        const token = req.cookies.token || req.headers.authorization.split(' ')[1];
        redisClient.set(token, 'logout', 'EX', 60 * 60 * 24);
        res.status(200).json({ message: 'Logged out successfully' });
    } catch (err) {
        console.log(err);
        res.status(400).send(err.message);
    }
};

export const getAllUsersController = async (req, res) => {
    try {
        const loggedInUser = await userModel.findOne({ email: req.user.email });
        const allUsers = await userService.getAllUsers({ userId: loggedInUser._id });
        return res.status(200).json({ users: allUsers });
    } catch (err) {
        console.log(err);
        res.status(400).json({ error: err.message });
    }
};

// ✅ FIXED: Added mongoose import
export const getAvailableUsersForProjectController = async (req, res) => {
    try {
        const { projectId } = req.params;
        const userId = req.user._id;

        // ✅ Now mongoose is defined
        if (!mongoose.Types.ObjectId.isValid(projectId)) {
            return res.status(400).json({ 
                error: 'Invalid project ID format' 
            });
        }

        const project = await projectModel.findById(projectId);
        
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        if (!project.users.includes(userId)) {
            return res.status(403).json({ 
                error: 'You do not have access to this project' 
            });
        }

        const availableUsers = await userModel.find({
            _id: { 
                $nin: [...project.users, userId]
            }
        }, 'email _id');

        return res.status(200).json({
            users: availableUsers
        });
    } catch (err) {
        console.log(err);
        res.status(400).json({ error: err.message });
    }
};