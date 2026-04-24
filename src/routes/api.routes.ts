import { Router } from 'express';
import { applyForLoan } from '../controllers/loan.controller';
import { verifyAuth } from '../middlewares/auth.middleware';

const router = Router();

// Apply auth middleware to protect the API
router.post('/loan/apply', verifyAuth, applyForLoan);

export default router;
