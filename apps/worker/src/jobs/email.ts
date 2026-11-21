import nodemailer, { type Transporter } from 'nodemailer';
import { register } from '../handlers';

export interface EmailPayload {
  to: string;
  subject: string;
  text: string;
  capture?: boolean;
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
register('email.send', async (raw, ctx) => {
  const email = raw as EmailPayload;
  const server = smtp();
  if (email.capture || !server) {
    await ctx.db.capturedEmail.create({
      data: {
        tenantId: ctx.tenantId,
        to: email.to,
        subject: email.subject,
        text: email.text,
        reason: email.capture ? 'demo' : 'no_mail_server',
      },
    });
    ctx.log(`email to ${email.to} captured (${email.capture ? 'demo' : 'no mail server'}): ${email.subject}`);
    return;
  }
  await server.sendMail({
    from: process.env.MAIL_FROM ?? 'CAFM <no-reply@cafm.invalid>',
    to: email.to,
    subject: email.subject,
    text: email.text,
  });
  ctx.log(`email sent to ${email.to}: ${email.subject}`);
});
