import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { sendSupportTicket } from '../services/email.service.js';
import prisma from '../config/db.js';

const router = Router();
router.use(authenticate);

router.post('/ticket', async (req: any, res) => {
  const { category, subject, message, email, phone, merchantId } = req.body;

  if (!category || !subject?.trim() || !message?.trim()) {
    res.status(400).json({ error: 'Category, subject and message are required.' });
    return;
  }

  try {
    // Fetch business name + id for the email
    const business = await prisma.business.findUnique({
      where: { userId: req.user.userId },
      select: { name: true, id: true },
    });

    await sendSupportTicket({
      category,
      subject: subject.trim(),
      message: message.trim(),
      fromEmail: email || req.user.email || '',
      fromPhone: phone || '',
      businessName: business?.name || 'Unknown',
      merchantId: merchantId || business?.id || '',
    });

    res.json({ ok: true });
  } catch (err: any) {
    console.error('[support] Failed to send ticket:', err.message);
    res.status(500).json({ error: 'Failed to send ticket. Please try again.' });
  }
});

export default router;
