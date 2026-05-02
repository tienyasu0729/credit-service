import { Request, Response } from 'express';
import prisma from '../lib/db';
import { sendCallback } from '../services/callback.service';
import { appEvents } from '../lib/events';

const REASON_CODES = [
  'INSUFFICIENT_INCOME',
  'BAD_CREDIT_HISTORY',
  'EXISTING_LOAN_TOO_HIGH',
  'MISSING_DOCUMENT',
  'INVALID_INFORMATION'
];

export const REASON_CODE_LABELS: Record<string, string> = {
  'INSUFFICIENT_INCOME': 'Thu nhập không đủ tiêu chuẩn',
  'BAD_CREDIT_HISTORY': 'Lịch sử tín dụng xấu (Nợ xấu)',
  'EXISTING_LOAN_TOO_HIGH': 'Dư nợ hiện tại quá cao',
  'MISSING_DOCUMENT': 'Thiếu hồ sơ/chứng từ',
  'INVALID_INFORMATION': 'Thông tin cung cấp không hợp lệ'
};

const cleanString = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
};

const getNested = (source: unknown, path: string[]): unknown => {
  let current = source;
  for (const key of path) {
    if (!current || typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
};

const resolveStoredExternalId = (application: any): string | null => {
  const direct = cleanString(application?.externalId);
  if (direct) return direct;

  return (
    cleanString(application?.snapshotJson?.applicationId) ||
    cleanString(application?.snapshotJson?.id) ||
    cleanString(getNested(application?.rawPayloadJson, ['applicationSnapshot', 'applicationId'])) ||
    cleanString(getNested(application?.rawPayloadJson, ['applicationSnapshot', 'id'])) ||
    cleanString(application?.rawPayloadJson?.externalId) ||
    null
  );
};

export const getDashboard = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;

    let applications: any[] = [];
    let total = 0;
    try {
      [applications, total] = await Promise.all([
        prisma.loanApplication.findMany({
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.loanApplication.count(),
      ]);
    } catch (e: any) {
      const schemaNotReady = String(e?.code || '') === 'P2022';
      if (!schemaNotReady) throw e;
      [applications, total] = await Promise.all([
        prisma.$queryRawUnsafe<any[]>(`
          SELECT "id","externalId","customerName","cccd","phone","amount","term","status","reasonCode","note","cccdUrl","incomeProofUrl","contractUrl","createdAt","updatedAt"
          FROM "LoanApplication"
          ORDER BY "createdAt" DESC
          OFFSET $1 LIMIT $2
        `, skip, limit),
        prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS total FROM "LoanApplication"`).then((rows) => Number(rows?.[0]?.total || 0)),
      ]);
    }

    const totalPages = Math.ceil(total / limit);

    res.render('dashboard', {
      applications,
      currentPage: page,
      totalPages,
      total,
    });
  } catch (error) {
    console.error('[AdminController] Error fetching dashboard:', error);
    res.status(500).send('Internal Server Error');
  }
};

export const getDetail = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    let application: any = null;
    try {
      application = await prisma.loanApplication.findUnique({
        where: { id },
      });
    } catch (e: any) {
      const schemaNotReady = String(e?.code || '') === 'P2022';
      if (!schemaNotReady) throw e;
      const rows = await prisma.$queryRawUnsafe<any[]>(`
        SELECT "id","externalId","customerName","cccd","phone","amount","term","status","reasonCode","note","cccdUrl","incomeProofUrl","contractUrl","createdAt","updatedAt"
        FROM "LoanApplication"
        WHERE "id" = $1
        LIMIT 1
      `, id);
      application = rows?.[0] || null;
    }

    if (!application) {
      return res.status(404).send('Loan Application not found');
    }

    res.render('detail', {
      application,
      reasonCodes: REASON_CODES,
      reasonLabels: REASON_CODE_LABELS,
    });
  } catch (error) {
    console.error('[AdminController] Error fetching detail:', error);
    res.status(500).send('Internal Server Error');
  }
};

export const handleAction = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const action = req.body.action as string;
    const reasonCode = req.body.reasonCode as string;
    const note = req.body.note as string;

    let application: any = null;
    try {
      application = await prisma.loanApplication.findUnique({
        where: { id },
      });
    } catch (e: any) {
      const schemaNotReady = String(e?.code || '') === 'P2022';
      if (!schemaNotReady) throw e;
      const rows = await prisma.$queryRawUnsafe<any[]>(`
        SELECT "id","externalId","status"
        FROM "LoanApplication"
        WHERE "id" = $1
        LIMIT 1
      `, id);
      application = rows?.[0] || null;
    }

    if (!application) {
      return res.status(404).send('Not found');
    }

    if (application.status !== 'PENDING') {
      return res.status(400).send('Application is already processed');
    }

    // Safety guard: only callback to main-system for records originated from it.
    // externalId is expected to be main-system application id.
    const externalId = resolveStoredExternalId(application);
    if (!externalId) {
      return res.status(400).send('Application has no externalId. Cannot sync callback to main system.');
    }

    if (externalId !== application.externalId) {
      try {
        await prisma.loanApplication.update({
          where: { id },
          data: { externalId },
        });
      } catch (e: any) {
        const schemaNotReady = String(e?.code || '') === 'P2022';
        if (!schemaNotReady) throw e;
        await prisma.$executeRawUnsafe(`
          UPDATE "LoanApplication"
          SET "externalId" = $2, "updatedAt" = NOW()
          WHERE "id" = $1
        `, id, externalId);
      }
    }

    if (action === 'APPROVE') {
      try {
        await prisma.loanApplication.update({
          where: { id },
          data: { status: 'APPROVED' },
        });
      } catch (e: any) {
        const schemaNotReady = String(e?.code || '') === 'P2022';
        if (!schemaNotReady) throw e;
        await prisma.$executeRawUnsafe(`
          UPDATE "LoanApplication"
          SET "status" = 'APPROVED', "updatedAt" = NOW()
          WHERE "id" = $1
        `, id);
      }
      // Fire and forget callback (no await necessary to hold up UI, or we can await it)
      // We will await to ensure it fires, but not rollback if it fails (handled in service)
      await sendCallback(id, externalId, 'APPROVED');

    } else if (action === 'REJECT') {
      if (!reasonCode || !REASON_CODES.includes(reasonCode)) {
        return res.status(400).send('Valid reasonCode is required for REJECT');
      }

      try {
        await prisma.loanApplication.update({
          where: { id },
          data: {
            status: 'REJECTED',
            reasonCode,
            note: note || null
          },
        });
      } catch (e: any) {
        const schemaNotReady = String(e?.code || '') === 'P2022';
        if (!schemaNotReady) throw e;
        await prisma.$executeRawUnsafe(`
          UPDATE "LoanApplication"
          SET "status" = 'REJECTED', "reasonCode" = $2, "note" = $3, "updatedAt" = NOW()
          WHERE "id" = $1
        `, id, reasonCode, note || null);
      }

      await sendCallback(id, externalId, 'REJECTED', reasonCode, note);
    } else {
      return res.status(400).send('Invalid action');
    }

    res.redirect(`/admin/${id}`);
  } catch (error) {
    console.error('[AdminController] Error handling action:', error);
    res.status(500).send('Internal Server Error');
  }
};

export const streamEvents = (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (application: any) => {
    res.write(`data: ${JSON.stringify(application)}\n\n`);
  };

  appEvents.on('NEW_APPLICATION', sendEvent);

  req.on('close', () => {
    appEvents.removeListener('NEW_APPLICATION', sendEvent);
  });
};
