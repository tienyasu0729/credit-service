import { Router } from 'express';
import { getDashboard, getDetail, handleAction, streamEvents } from '../controllers/admin.controller';

const router = Router();

router.get('/', getDashboard);
router.get('/events', streamEvents);
router.get('/:id', getDetail);
router.post('/:id/action', handleAction);

export default router;
