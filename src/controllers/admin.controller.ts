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

export const getDashboard = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const [applications, total] = await Promise.all([
      prisma.loanApplication.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.loanApplication.count(),
    ]);

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
    const application = await prisma.loanApplication.findUnique({
      where: { id },
    });

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

    const application = await prisma.loanApplication.findUnique({
      where: { id },
    });

    if (!application) {
      return res.status(404).send('Not found');
    }

    if (application.status !== 'PENDING') {
      return res.status(400).send('Application is already processed');
    }

    if (action === 'APPROVE') {
      await prisma.loanApplication.update({
        where: { id },
        data: { status: 'APPROVED' },
      });
      // Fire and forget callback (no await necessary to hold up UI, or we can await it)
      // We will await to ensure it fires, but not rollback if it fails (handled in service)
      await sendCallback(id, application.externalId, 'APPROVED');

    } else if (action === 'REJECT') {
      if (!reasonCode || !REASON_CODES.includes(reasonCode)) {
        return res.status(400).send('Valid reasonCode is required for REJECT');
      }

      await prisma.loanApplication.update({
        where: { id },
        data: { 
          status: 'REJECTED',
          reasonCode,
          note: note || null
        },
      });

      await sendCallback(id, application.externalId, 'REJECTED', reasonCode, note);
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
