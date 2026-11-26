import nodemailer, { type Transporter } from 'nodemailer';
import { register, type JobContext } from '../handlers';

export interface EmailPayload {
  to: string;
  subject: string;
  text: string;
  capture?: boolean;
  replyTo?: string;
  messageId?: string;
  attachments?: { filename: string; contentType: string; contentBase64: string }[];
}

let transport: Transporter | null | undefined;

/** SMTP transport from SMTP_URL (e.g. smtp://localhost:1025 for Mailpit), or null if not configured. */
function smtp(): Transporter | null {
  if (transport === undefined)
    transport = process.env.SMTP_URL ? nodemailer.createTransport(process.env.SMTP_URL) : null;
  return transport;
}

/**
 * Sends an email, or captures it instead: always for demo tenants (doc 06:
 * demo email is never sent) and whenever no mail server is configured.
 */
export async function sendEmail(email: EmailPayload, ctx: JobContext) {
  const server = smtp();
  if (email.capture || !server) {
    await ctx.db.capturedEmail.create({
      data: {
        tenantId: ctx.tenantId,
        to: email.to,
        subject: email.subject,
        text: email.attachments?.length
          ? `${email.text}\n\n[Attached: ${email.attachments.map((file) => file.filename).join(', ')}]`
          : email.text,
        reason: email.capture ? 'demo' : 'no_mail_server',
      },
    });
    ctx.log(`email captured (${email.capture ? 'demo' : 'no mail server'})`);
    return;
  }
  await server.sendMail({
    from: process.env.MAIL_FROM ?? 'FM Stead <no-reply@cafm.invalid>',
    to: email.to,
    subject: email.subject,
    text: email.text,
    replyTo: email.replyTo,
    messageId: email.messageId,
    attachments: email.attachments?.map((file) => ({
      filename: file.filename,
      contentType: file.contentType,
      content: Buffer.from(file.contentBase64, 'base64'),
    })),
    // Tell auto-responders and other helpdesks not to answer, so two systems cannot reply to each other forever.
    headers: { 'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'All' },
  });
  ctx.log('email sent');
}

register('email.send', (raw, ctx) => sendEmail(raw as EmailPayload, ctx));
