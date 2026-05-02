import { Request, Response } from 'express';
import prisma from '../lib/db';
import { appEvents } from '../lib/events';
import { randomUUID } from 'crypto';

const isValidUrl = (urlString: string) => {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (e) {
    return false;
  }
};

const resolveExternalId = (
  externalId: unknown,
  applicationId: unknown,
  applicationSnapshot: unknown
): string | null => {
  const toClean = (v: unknown): string | null => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s.length > 0 ? s : null;
  };

  const fromPayload = toClean(externalId);
  if (fromPayload) return fromPayload;

  const fromApplicationId = toClean(applicationId);
  if (fromApplicationId) return fromApplicationId;

  if (applicationSnapshot && typeof applicationSnapshot === 'object') {
    const snap = applicationSnapshot as Record<string, unknown>;
    return toClean(snap.applicationId) || toClean(snap.id);
  }

  return null;
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
      applicationId,
      income,
      company,
      applicationSnapshot
    } = req.body;
    const resolvedExternalId = resolveExternalId(externalId, applicationId, applicationSnapshot);

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

    // Document URL Validation (SSRF Prevention: only validate URL format, do not fetch)
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
    if (Array.isArray(documents.allDocuments)) {
      for (const item of documents.allDocuments) {
        if (!item || typeof item !== 'object') continue;
        if (!item.url || typeof item.url !== 'string' || !isValidUrl(item.url)) {
          return res.status(400).json({ error: 'documents.allDocuments[*].url must be a valid HTTP/HTTPS URL' });
        }
      }
    }
    if (documents.byType && typeof documents.byType === 'object') {
      for (const urls of Object.values(documents.byType as Record<string, unknown>)) {
        if (!Array.isArray(urls)) continue;
        for (const url of urls) {
          if (typeof url !== 'string' || !isValidUrl(url)) {
            return res.status(400).json({ error: 'documents.byType[*] must contain valid HTTP/HTTPS URLs' });
          }
        }
      }
    }

    // 2. Save to Database
    // Backward compatible: if DB has not migrated new JSON columns yet,
    // fallback to minimal create payload so loan apply flow is not blocked.
    let application;
    try {
      application = await prisma.loanApplication.create({
        data: {
          externalId: resolvedExternalId,
          customerName,
          cccd,
          phone,
          amount,
          term,
          status: 'PENDING',
          cccdUrl: documents.cccdUrl,
          incomeProofUrl: documents.incomeProofUrl || null,
          contractUrl: documents.contractUrl || null,
          documentsJson: documents ?? null,
          snapshotJson: applicationSnapshot ?? null,
          rawPayloadJson: req.body ?? null,
        },
      });
    } catch (dbError: any) {
      const msg = String(dbError?.message || '');
      const code = String(dbError?.code || '');
      const schemaNotReady =
        code === 'P2022' ||
        msg.includes('documentsJson') ||
        msg.includes('snapshotJson') ||
        msg.includes('rawPayloadJson');

      if (!schemaNotReady) throw dbError;

      console.warn('[LoanController] DB schema not ready for extended payload columns. Fallback minimal create.');
      const newId = randomUUID();
      const rows = await prisma.$queryRawUnsafe<any[]>(`
        INSERT INTO "LoanApplication"
          ("id","externalId","customerName","cccd","phone","amount","term","status","cccdUrl","incomeProofUrl","contractUrl","createdAt","updatedAt")
        VALUES
          ($1,$2,$3,$4,$5,$6,$7,'PENDING',$8,$9,$10,NOW(),NOW())
        RETURNING "id","externalId","customerName","cccd","phone","amount","term","status","cccdUrl","incomeProofUrl","contractUrl","createdAt","updatedAt"
      `, newId, resolvedExternalId, customerName, cccd, phone, amount, term, documents.cccdUrl, documents.incomeProofUrl || null, documents.contractUrl || null);

      if (!rows || rows.length === 0) {
        throw new Error('Fallback insert failed: no row returned');
      }
      application = rows[0];
    }

    // 3. Emit Realtime Event
    appEvents.emit('NEW_APPLICATION', application);

    // 4. Return Response (Async callback will happen manually via Admin UI)
    return res.status(200).json({
      loanId: application.id,
      status: 'PENDING'
    });

  } catch (error) {
    console.error('[LoanController] Error processing application:', error);
    const details = error instanceof Error ? error.message : String(error);
    const code = (error as any)?.code || null;
    const expose = process.env.NODE_ENV !== 'production';
    return res.status(500).json({
      error: 'Internal server error',
      ...(expose ? { details, code } : {}),
    });
  }
};
