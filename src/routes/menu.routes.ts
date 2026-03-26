import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createCategorySchema, updateCategorySchema, createItemSchema, updateItemSchema, importUrlSchema, importPosSchema } from '../validators/menu.validator.js';
import * as menuController from '../controllers/menu.controller.js';
import { MAX_FILE_SIZE } from '../utils/constants.js';

const upload = multer({ dest: 'uploads/', limits: { fileSize: MAX_FILE_SIZE } });

const router = Router();
router.use(authenticate);

router.get('/categories', menuController.getCategories);
router.get('/categories/:id/items', menuController.getCategoryItems);
router.post('/categories', validate(createCategorySchema), menuController.createCategory);
router.put('/categories/:id', validate(updateCategorySchema), menuController.updateCategory);
router.delete('/categories/:id', menuController.deleteCategory);

router.post('/items', validate(createItemSchema), menuController.createItem);
router.put('/items/:id', validate(updateItemSchema), menuController.updateItem);
router.delete('/items/:id', menuController.deleteItem);

router.post('/import/url', validate(importUrlSchema), menuController.importFromUrl);
router.post('/import/file', upload.single('file'), menuController.importFromFile);
router.post('/import/pdf', upload.single('file'), menuController.importFromPdf);
router.post('/import/image', upload.single('file'), menuController.importFromImage);
router.post('/import/pos', validate(importPosSchema), menuController.importFromPos);

export default router;
