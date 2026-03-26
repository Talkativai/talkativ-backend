import { Router } from 'express';
import multer from 'multer';
import os from 'os';
import { authenticate } from '../middleware/auth.js';
import * as uploadController from '../controllers/upload.controller.js';
import { MAX_FILE_SIZE } from '../utils/constants.js';

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid file type'));
  },
});

const router = Router();
router.use(authenticate);

router.post('/menu-pdf', upload.single('file'), uploadController.uploadMenuPdf);
router.post('/menu-image', upload.single('file'), uploadController.uploadMenuImage);

export default router;
