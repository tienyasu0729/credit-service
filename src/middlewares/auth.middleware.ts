import { Request, Response, NextFunction } from 'express';
import { verifyHmacSignature } from '../lib/auth';

const API_KEY = process.env.API_KEY || '';
const API_SECRET = process.env.API_SECRET || '';

// Extend Express Request to include raw body if needed, but for simplicity
// we will assume req.body is already parsed and we stringify it.
// In production, you'd use raw-body parser for strict HMAC.

export const verifyAuth = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.header('X-API-Key') || req.header('Authorization')?.replace('Bearer ', '');
  const timestamp = req.header('X-Timestamp');
  const signature = req.header('X-Signature');

  if (!apiKey || !timestamp || !signature) {
    return res.status(401).json({ error: 'Missing authentication headers' });
  }

  if (apiKey !== API_KEY) {
    return res.status(401).json({ error: 'Invalid API Key' });
  }

  // Prevent replay attacks (e.g., timestamp must be within 5 minutes)
  const currentTimestamp = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTimestamp - parseInt(timestamp, 10)) > 300) {
    return res.status(401).json({ error: 'Request expired or invalid timestamp' });
  }

  // Validate signature
  try {
    const payloadString = JSON.stringify(req.body);
    const isValid = verifyHmacSignature(payloadString, timestamp, signature, API_SECRET);
    
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
  } catch (error) {
    return res.status(401).json({ error: 'Signature verification failed' });
  }

  next();
};
