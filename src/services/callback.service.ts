import { generateHmacSignature } from '../lib/auth';

const CALLBACK_URL = process.env.CALLBACK_URL || '';
const API_KEY = process.env.API_KEY || '';
const API_SECRET = process.env.API_SECRET || '';

export const sendCallback = async (
  loanId: string,
  externalId: string | null,
  status: 'APPROVED' | 'REJECTED',
  reasonCode?: string | null,
  note?: string | null
) => {
  if (!CALLBACK_URL) {
    console.error('[CallbackService] CALLBACK_URL is not defined in .env');
    return;
  }

  const payloadObj = {
    loanId,
    externalId: externalId || null,
    status,
    reasonCode: reasonCode || null,
    note: note || null,
  };

  const payloadString = JSON.stringify(payloadObj);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = generateHmacSignature(payloadString, timestamp, API_SECRET);

  try {
    console.log(`[CallbackService] Sending callback for Loan ${loanId}...`);
    const response = await fetch(CALLBACK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
        'X-Timestamp': timestamp,
        'X-Signature': signature,
      },
      body: payloadString,
    });

    if (response.ok) {
      console.log(`[CallbackService] Success: Callback sent for Loan ${loanId}`);
    } else {
      console.error(`[CallbackService] Failed: Main system returned status ${response.status} for Loan ${loanId}`);
      // As per PLAN: Do NOT rollback DB status if callback fails.
    }
  } catch (error) {
    console.error(`[CallbackService] Error: Could not reach main system at ${CALLBACK_URL}`, error);
    // As per PLAN: Do NOT rollback DB status if callback fails.
  }
};
