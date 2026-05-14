import { Router } from 'express';
import { body } from 'express-validator';
import * as projectController from '../controllers/project.controller.js';
import * as authMiddleWare from '../middleware/auth.middleware.js';

const router = Router();

// ── Existing routes ───────────────────────────────────────────────────────────
router.post('/create',
    authMiddleWare.authUser,
    body('name').isString().trim().notEmpty().withMessage('Project name is required'),
    projectController.createProject
);

router.get('/all',
    authMiddleWare.authUser,
    projectController.getAllProject
);

router.put('/add-user',
    authMiddleWare.authUser,
    body('projectId').isString().withMessage('Project ID is required'),
    body('users').isArray({ min: 1 }).withMessage('Users must be a non-empty array')
        .bail()
        .custom((users) => users.every(u => typeof u === 'string'))
        .withMessage('Each user must be a string ID'),
    projectController.addUserToProject
);

router.get('/get-project/:projectId',
    authMiddleWare.authUser,
    projectController.getProjectById
);

router.put('/update-file-tree',
    authMiddleWare.authUser,
    body('projectId').isString().withMessage('Project ID is required'),
    body('fileTree').isObject().withMessage('File tree must be an object'),
    projectController.updateFileTree
);

// ── Message persistence ───────────────────────────────────────────────────────
router.post('/messages',
    authMiddleWare.authUser,
    body('projectId').isString().withMessage('projectId required'),
    body('messages').isArray({ min: 1 }).withMessage('messages array required'),
    projectController.saveMessages
);

router.get('/:projectId/messages',
    authMiddleWare.authUser,
    projectController.getMessages
);

// ── Project management ────────────────────────────────────────────────────────
router.delete('/:projectId',
    authMiddleWare.authUser,
    projectController.deleteProject
);

// NEW: Rename project
router.patch('/:projectId/rename',
    authMiddleWare.authUser,
    body('name').isString().trim().notEmpty().withMessage('New name is required'),
    projectController.renameProject
);

// NEW: Remove a collaborator (owner only)
router.delete('/:projectId/collaborators/:userId',
    authMiddleWare.authUser,
    projectController.removeCollaborator
);

export default router;
