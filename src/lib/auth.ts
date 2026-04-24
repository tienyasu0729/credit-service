import crypto from 'crypto';

/**
 * Validates an HMAC SHA256 signature
 * Payload should be the raw request body string concatenated with the timestamp
 */
export const verifyHmacSignature = (
  payload: string,
  timestamp: string,
  signature: string,
  secret: string
): boolean => {
  const dataToSign = `${payload}.${timestamp}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(dataToSign)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(signature)
  );
};

/**
 * Generates an HMAC SHA256 signature
 */
export const generateHmacSignature = (
  payload: string,
  timestamp: string,
  secret: string
): string => {
  const dataToSign = `${payload}.${timestamp}`;
  return crypto.createHmac('sha256', secret).update(dataToSign).digest('hex');
};
