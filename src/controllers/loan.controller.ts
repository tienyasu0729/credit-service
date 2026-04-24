import { Request, Response } from 'express';
import prisma from '../lib/db';
import { appEvents } from '../lib/events';

const isValidUrl = (urlString: string) => {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (e) {
    return false;
  }
};

export const applyForLoan = async (req: Request, res: Response) => {
  try {
    const {
      customerName,
      amount,
      cccd,
      phone,
      term,
      documents,
      externalId,
      income,
      company
    } = req.body;

    // 1. Validation
    if (!customerName || typeof customerName !== 'string') {
      return res.status(400).json({ error: 'customerName is required and must be a string' });
    }
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: 'amount is required and must be > 0' });
    }
    if (!cccd || typeof cccd !== 'string') {
      return res.status(400).json({ error: 'cccd is required and must be a string' });
    }
    if (!phone || typeof phone !== 'string' || !/^\+?[0-9]{9,15}$/.test(phone)) {
      return res.status(400).json({ error: 'phone is required and must be a valid format' });
    }
    if (!term || typeof term !== 'number' || term <= 0) {
      return res.status(400).json({ error: 'term is required and must be > 0' });
    }

    // Document URL Validation (SSRF Prevention: Only validate format, don't fetch)
    if (!documents || !documents.cccdUrl) {
      return res.status(400).json({ error: 'documents.cccdUrl is required' });
    }
    if (!isValidUrl(documents.cccdUrl)) {
      return res.status(400).json({ error: 'documents.cccdUrl must be a valid HTTP/HTTPS URL' });
    }
    if (documents.incomeProofUrl && !isValidUrl(documents.incomeProofUrl)) {
      return res.status(400).json({ error: 'documents.incomeProofUrl must be a valid HTTP/HTTPS URL' });
    }
    if (documents.contractUrl && !isValidUrl(documents.contractUrl)) {
      return res.status(400).json({ error: 'documents.contractUrl must be a valid HTTP/HTTPS URL' });
    }

    // 2. Save to Database
    const application = await prisma.loanApplication.create({
      data: {
        externalId: externalId || null,
        customerName,
        cccd,
        phone,
        amount,
        term,
        status: 'PENDING',
        cccdUrl: documents.cccdUrl,
        incomeProofUrl: documents.incomeProofUrl || null,
        contractUrl: documents.contractUrl || null,
        // Optional fields if we want to store them, but schema doesn't have income/company.
        // Wait, schema doesn't have income or company. Let's omit or just ignore them since it's a fake bank.
      },
    });

    // 3. Emit Realtime Event
    appEvents.emit('NEW_APPLICATION', application);

    // 4. Return Response (Async callback will happen manually via Admin UI)
    return res.status(200).json({
      loanId: application.id,
      status: 'PENDING'
    });

  } catch (error) {
    console.error('[LoanController] Error processing application:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
