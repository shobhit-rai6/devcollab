import userModel from '../models/user.model.js';
import projectModel from '../models/project.model.js';
import mongoose from 'mongoose';
import * as userService from '../services/user.service.js';
import { validationResult } from 'express-validator';
import redisClient from '../services/redis.service.js';

// ── Register ──────────────────────────────────────────────────────────────────
export const createUserController = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
        const user = await userService.createUser(req.body);
        const token = user.generateJWT();
        // BUG FIX: mutate _doc copy so we don't expose password in response
        const userObj = user.toObject();
        delete userObj.password;
        res.status(201).json({ user: userObj, token });
    } catch (error) {
        res.status(400).send(error.message);
    }
};

// ── Login ─────────────────────────────────────────────────────────────────────
export const loginController = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
        const { email, password } = req.body;
        const user = await userModel.findOne({ email }).select('+password');
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        const isMatch = await user.isValidPassword(password);
        if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

        const token = user.generateJWT();
        const userObj = user.toObject();
        delete userObj.password;
        res.status(200).json({ user: userObj, token });
    } catch (err) {
        console.error('loginController:', err.message);
        res.status(400).send(err.message);
    }
};

// ── Profile ───────────────────────────────────────────────────────────────────
export const profileController = async (req, res) => {
    res.status(200).json({ user: req.user });
};

// ── Logout ────────────────────────────────────────────────────────────────────
export const logoutController = async (req, res) => {
    try {
        // BUG FIX: the original code crashed if req.headers.authorization was
        // undefined (no header) because it called .split(' ') on undefined.
        let token = req.cookies?.token;
        if (!token && req.headers.authorization) {
            token = req.headers.authorization.split(' ')[1];
        }
        if (!token) return res.status(400).json({ error: 'No token found' });

        // Blacklist the token in Redis for 24 hours
        await redisClient.set(token, 'logout', 'EX', 60 * 60 * 24);
        res.clearCookie('token');
        res.status(200).json({ message: 'Logged out successfully' });
    } catch (err) {
        console.error('logoutController:', err.message);
        res.status(400).send(err.message);
    }
};

// ── Get all users (excluding self) ────────────────────────────────────────────
export const getAllUsersController = async (req, res) => {
    try {
        const loggedInUser = await userModel.findOne({ email: req.user.email });
        if (!loggedInUser) return res.status(404).json({ error: 'User not found' });
        const allUsers = await userService.getAllUsers({ userId: loggedInUser._id });
        return res.status(200).json({ users: allUsers });
    } catch (err) {
        console.error('getAllUsersController:', err.message);
        res.status(400).json({ error: err.message });
    }
};

// ── Get users available to add to a project ───────────────────────────────────
// (excludes existing members and the owner)
export const getAvailableUsersForProjectController = async (req, res) => {
    try {
        const { projectId } = req.params;
        const userEmail = req.user.email;

        if (!mongoose.Types.ObjectId.isValid(projectId))
            return res.status(400).json({ error: 'Invalid project ID format' });

        const loggedInUser = await userModel.findOne({ email: userEmail });
        if (!loggedInUser) return res.status(404).json({ error: 'User not found' });

        const project = await projectModel.findById(projectId);
        if (!project) return res.status(404).json({ error: 'Project not found' });

        // BUG FIX: check membership via toString() comparison to avoid ObjectId type mismatch
        const isMember = project.users.some(uid => uid.toString() === loggedInUser._id.toString());
        if (!isMember) return res.status(403).json({ error: 'Access denied' });

        const availableUsers = await userModel.find({
            _id: { $nin: [...project.users, loggedInUser._id] }
        }, 'email _id');

        return res.status(200).json({ users: availableUsers });
    } catch (err) {
        console.error('getAvailableUsersForProjectController:', err.message);
        res.status(400).json({ error: err.message });
    }
};
