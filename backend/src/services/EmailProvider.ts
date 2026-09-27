import { MockEmailProvider } from './MockEmailProvider';

export interface EmailMessage {
  recipientEmail: string;
  recipientUserId: string;
  subject: string;
  body: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

export function getEmailProvider(): EmailProvider {
  const configured = (process.env.EMAIL_PROVIDER || 'mock').toLowerCase();
  if (configured !== 'mock') {
    console.warn(`[NotificationService] Unsupported EMAIL_PROVIDER "${configured}"; using MockEmailProvider`);
  }
  return new MockEmailProvider();
}