/********************************************************************
 * Project: EonlineBazar
 * File: noteRoutes.js
 * Location: backend/src/routes/noteRoutes.js
 * Description: Private note/expense API. All routes require a logged-in
 * customer session (verifyUser / protect).
 ********************************************************************/

const express = require('express');
const router = express.Router();
const noteController = require('../controllers/noteController');
const { verifyUser: protect } = require('../middlewares/authMiddleware');

router.use(protect);

router.get('/', noteController.getNotes);
router.post('/', noteController.createNote);
router.put('/:id', noteController.updateNote);
router.delete('/:id', noteController.deleteNote);

module.exports = router;
