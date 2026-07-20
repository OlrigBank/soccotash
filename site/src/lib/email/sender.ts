import crypto from 'node:crypto';
import net from 'node:net';
import tls from 'node:tls';
import type { Socket } from 'node:net';

export type OutgoingEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  bcc?: string[];
};

export type EmailSendResult = {
  messageId: string | null;
  provider: 'smtp' | 'resend';
};

type EmailConfiguration = {
  provider: 'smtp' | 'resend' | null;
  configured: boolean;
  from: string;
  replyTo: string | null;
  problem: string | null;
};

function cleanHeader(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function envelopeAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] || value).trim();
}

function splitAddresses(value: string | undefined): string[] {
  return (value || '')
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getEmailConfiguration(): EmailConfiguration {
  const requested = (process.env.EMAIL_PROVIDER || '').trim().toLowerCase();
  const from = (process.env.BOOKING_EMAIL_FROM || '').trim();
  const replyTo = (process.env.BOOKING_EMAIL_REPLY_TO || '').trim() || null;
  const provider = requested === 'resend' || requested === 'smtp'
    ? requested
    : process.env.RESEND_API_KEY
      ? 'resend'
      : process.env.SMTP_HOST
        ? 'smtp'
        : null;

  if (!provider) {
    return {
      provider: null,
      configured: false,
      from,
      replyTo,
      problem: 'No email provider is configured. Set EMAIL_PROVIDER and the matching provider settings.',
    };
  }
  if (!from) {
    return { provider, configured: false, from, replyTo, problem: 'BOOKING_EMAIL_FROM is required.' };
  }
  if (provider === 'resend' && !process.env.RESEND_API_KEY) {
    return { provider, configured: false, from, replyTo, problem: 'RESEND_API_KEY is required for Resend.' };
  }
  if (provider === 'smtp' && !process.env.SMTP_HOST) {
    return { provider, configured: false, from, replyTo, problem: 'SMTP_HOST is required for SMTP.' };
  }
  if (provider === 'smtp' && process.env.SMTP_USER && !process.env.SMTP_PASSWORD) {
    return { provider, configured: false, from, replyTo, problem: 'SMTP_PASSWORD is required when SMTP_USER is set.' };
  }
  return { provider, configured: true, from, replyTo, problem: null };
}

function encodeSubject(value: string): string {
  const safe = cleanHeader(value);
  return /[^\x20-\x7E]/.test(safe)
    ? `=?UTF-8?B?${Buffer.from(safe, 'utf8').toString('base64')}?=`
    : safe;
}

function dotStuff(value: string): string {
  return value.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
}

function createMimeMessage(input: OutgoingEmail, from: string, defaultReplyTo: string | null): { raw: string; messageId: string } {
  const boundary = `soccotash-${crypto.randomBytes(12).toString('hex')}`;
  const messageId = `<${crypto.randomUUID()}@olrigbank.local>`;
  const headers = [
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${messageId}`,
    `From: ${cleanHeader(from)}`,
    `To: ${cleanHeader(input.to)}`,
    `Subject: ${encodeSubject(input.subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  const replyTo = input.replyTo || defaultReplyTo;
  if (replyTo) headers.push(`Reply-To: ${cleanHeader(replyTo)}`);

  const raw = [
    ...headers,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    input.text,
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    input.html,
    `--${boundary}--`,
    '',
  ].join('\r\n');
  return { raw, messageId };
}

class SmtpSession {
  private socket: Socket | tls.TLSSocket;
  private buffer = '';
  private responses: string[] = [];
  private waiters: Array<(line: string) => void> = [];

  constructor(socket: Socket | tls.TLSSocket) {
    this.socket = socket;
    this.attach();
  }

  private attach(): void {
    this.socket.setEncoding('utf8');
    this.socket.on('data', (chunk: string | Buffer) => {
      this.buffer += String(chunk);
      let index = this.buffer.indexOf('\r\n');
      while (index >= 0) {
        const line = this.buffer.slice(0, index);
        this.buffer = this.buffer.slice(index + 2);
        const waiter = this.waiters.shift();
        if (waiter) waiter(line);
        else this.responses.push(line);
        index = this.buffer.indexOf('\r\n');
      }
    });
  }

  async upgrade(host: string, rejectUnauthorized: boolean): Promise<void> {
    this.socket.removeAllListeners('data');
    this.buffer = '';
    this.responses = [];
    this.socket = await new Promise<tls.TLSSocket>((resolve, reject) => {
      const secureSocket = tls.connect({
        socket: this.socket,
        servername: host,
        rejectUnauthorized,
      }, () => resolve(secureSocket));
      secureSocket.once('error', reject);
    });
    this.attach();
  }

  private nextLine(timeoutMs = 15000): Promise<string> {
    const existing = this.responses.shift();
    if (existing !== undefined) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('SMTP response timed out.')), timeoutMs);
      this.waiters.push((line) => {
        clearTimeout(timer);
        resolve(line);
      });
    });
  }

  async response(expected: number | number[]): Promise<string[]> {
    const expectedCodes = Array.isArray(expected) ? expected : [expected];
    const lines: string[] = [];
    let code = 0;
    while (true) {
      const line = await this.nextLine();
      lines.push(line);
      const match = line.match(/^(\d{3})([ -])/);
      if (!match) continue;
      code = Number(match[1]);
      if (match[2] === ' ') break;
    }
    if (!expectedCodes.includes(code)) {
      throw new Error(`SMTP command failed (${code}): ${lines.join(' ')}`);
    }
    return lines;
  }

  write(value: string): void {
    this.socket.write(value);
  }

  async command(command: string, expected: number | number[]): Promise<string[]> {
    this.write(`${command}\r\n`);
    return this.response(expected);
  }

  close(): void {
    this.socket.end();
  }
}

async function connectSocket(host: string, port: number, secure: boolean, rejectUnauthorized: boolean): Promise<Socket | tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const socket = secure
      ? tls.connect({ host, port, servername: host, rejectUnauthorized }, () => resolve(socket))
      : net.createConnection({ host, port }, () => resolve(socket));
    socket.setTimeout(20000, () => socket.destroy(new Error('SMTP connection timed out.')));
    socket.once('error', reject);
  });
}

async function sendWithSmtp(input: OutgoingEmail, configuration: EmailConfiguration): Promise<EmailSendResult> {
  const host = String(process.env.SMTP_HOST || '').trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;
  const rejectUnauthorized = String(process.env.SMTP_TLS_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false';
  const username = String(process.env.SMTP_USER || '').trim();
  const password = String(process.env.SMTP_PASSWORD || '');
  const recipients = [input.to, ...(input.bcc || []), ...splitAddresses(process.env.BOOKING_EMAIL_BCC)];
  const { raw, messageId } = createMimeMessage(input, configuration.from, configuration.replyTo);

  const socket = await connectSocket(host, port, secure, rejectUnauthorized);
  const session = new SmtpSession(socket);
  try {
    await session.response(220);
    const ehloName = String(process.env.SMTP_EHLO_NAME || 'olrigbank.local').replace(/[^A-Za-z0-9.-]/g, '') || 'olrigbank.local';
    const ehlo = await session.command(`EHLO ${ehloName}`, 250);
    const startTlsAvailable = ehlo.some((line) => /STARTTLS/i.test(line));
    if (!secure && startTlsAvailable) {
      await session.command('STARTTLS', 220);
      await session.upgrade(host, rejectUnauthorized);
      await session.command(`EHLO ${ehloName}`, 250);
    }
    if (username && !secure && !startTlsAvailable) {
      throw new Error('The SMTP server did not offer STARTTLS; refusing to send credentials over an unencrypted connection.');
    }
    if (username) {
      await session.command('AUTH LOGIN', 334);
      await session.command(Buffer.from(username).toString('base64'), 334);
      await session.command(Buffer.from(password).toString('base64'), 235);
    }
    await session.command(`MAIL FROM:<${envelopeAddress(configuration.from)}>`, 250);
    for (const recipient of recipients) {
      await session.command(`RCPT TO:<${envelopeAddress(recipient)}>`, [250, 251]);
    }
    await session.command('DATA', 354);
    session.write(`${dotStuff(raw)}\r\n.\r\n`);
    await session.response(250);
    await session.command('QUIT', 221).catch(() => undefined);
    return { messageId, provider: 'smtp' };
  } finally {
    session.close();
  }
}

async function sendWithResend(input: OutgoingEmail, configuration: EmailConfiguration): Promise<EmailSendResult> {
  const bcc = [...(input.bcc || []), ...splitAddresses(process.env.BOOKING_EMAIL_BCC)];
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: configuration.from,
      to: [input.to],
      ...(bcc.length ? { bcc } : {}),
      ...(input.replyTo || configuration.replyTo ? { reply_to: input.replyTo || configuration.replyTo } : {}),
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  });
  const payload = await response.json().catch(() => ({})) as { id?: string; message?: string; name?: string };
  if (!response.ok) {
    throw new Error(`Resend rejected the email (${response.status}): ${payload.message || payload.name || 'Unknown error'}`);
  }
  return { messageId: payload.id || null, provider: 'resend' };
}

export async function sendEmail(input: OutgoingEmail): Promise<EmailSendResult> {
  const configuration = getEmailConfiguration();
  if (!configuration.configured || !configuration.provider) {
    throw new Error(configuration.problem || 'Email delivery is not configured.');
  }
  return configuration.provider === 'resend'
    ? sendWithResend(input, configuration)
    : sendWithSmtp(input, configuration);
}
