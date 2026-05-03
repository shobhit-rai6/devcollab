// backend/routes/project.routes.js
import { Router } from 'express';
import { body } from 'express-validator';
import * as projectController from '../controllers/project.controller.js';
import * as authMiddleWare from '../middleware/auth.middleware.js';

const router = Router();

// ── Existing routes (unchanged) ───────────────────────────────────────────────

router.post('/create',
    authMiddleWare.authUser,
    body('name').isString().withMessage('Name is required'),
    projectController.createProject
)

router.get('/all',
    authMiddleWare.authUser,
    projectController.getAllProject
)

router.put('/add-user',
    authMiddleWare.authUser,
    body('projectId').isString().withMessage('Project ID is required'),
    body('users').isArray({ min: 1 }).withMessage('Users must be an array of strings').bail()
        .custom((users) => users.every(user => typeof user === 'string')).withMessage('Each user must be a string'),
    projectController.addUserToProject
)

router.get('/get-project/:projectId',
    authMiddleWare.authUser,
    projectController.getProjectById
)

router.put('/update-file-tree',
    authMiddleWare.authUser,
    body('projectId').isString().withMessage('Project ID is required'),
    body('fileTree').isObject().withMessage('File tree is required'),
    projectController.updateFileTree
)

// ── NEW: Message persistence ──────────────────────────────────────────────────

// Save messages to DB (called from frontend after each message)
router.post('/messages',
    authMiddleWare.authUser,
    body('projectId').isString().withMessage('projectId required'),
    body('messages').isArray({ min: 1 }).withMessage('messages array required'),
    projectController.saveMessages
)

// Load chat history for a project
router.get('/:projectId/messages',
    authMiddleWare.authUser,
    projectController.getMessages
)

// ── NEW: Delete project (owner only) ─────────────────────────────────────────
router.delete('/:projectId',
    authMiddleWare.authUser,
    projectController.deleteProject
)

export default router;