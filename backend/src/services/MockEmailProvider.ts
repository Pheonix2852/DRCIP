import type { EmailMessage, EmailProvider } from './EmailProvider';

export const mockEmailLog: Array<EmailMessage & { sentAt: Date }> = [];

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
  }
}