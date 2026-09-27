import path from 'node:path';
import fs from 'node:fs';
import type { EmailMessage, EmailProvider } from './EmailProvider';

export const mockEmailLog: Array<EmailMessage & { sentAt: Date }> = [];

export function mockEmailSinkPath(): string {
  return process.env.MOCK_EMAIL_SINK || path.resolve(process.cwd(), '.local', 'mock-mail.log');
}

// Development-only observability: append each mock email (full body incl. any
// reset link) as a JSON line so manual smoke tests can read the actual message.
// Never reaches production: gated so production deployments never write it.
// ponytail: plain JSONL file, no mailbox server or web viewer needed.
function writeSink(message: EmailMessage): void {
  if (process.env.NODE_ENV === 'production') return;
  try {
    const file = mockEmailSinkPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(
      file,
      JSON.stringify({
        sentAt: new Date(),
        recipientEmail: message.recipientEmail,
        subject: message.subject,
        body: message.body,
      }) + '\n'
    );
    // Hint only — the sink file, never the message body/token.
    console.log(`[MockEmailProvider] body → ${file}`);
  } catch (err) {
    console.warn(`[MockEmailProvider] Failed to write mock email sink: ${(err as Error).message}`);
  }
}

export class MockEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<void> {
    if (process.env.MOCK_EMAIL_FAIL === 'true') {
      throw new Error(`[MockEmailProvider] Simulated failure for ${message.recipientEmail}`);
    }
    if (!message.recipientEmail) {
      throw new Error('[MockEmailProvider] Missing recipient email');
    }
    mockEmailLog.push({ ...message, sentAt: new Date() });
    console.log(`[MockEmailProvider] To: ${message.recipientEmail} | Subject: ${message.subject}`);
    writeSink(message);
  }
}