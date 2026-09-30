export interface SmsMessage {
  recipientPhone: string;
  body: string;
}

export interface SmsProvider {
  send(message: SmsMessage): Promise<void>;
}

const mockSmsLog: string[] = [];

export class MockSmsProvider implements SmsProvider {
  async send(message: SmsMessage): Promise<void> {
    if (!message.recipientPhone) {
      throw new Error('[MockSmsProvider] Missing recipient phone');
    }
    mockSmsLog.push(`+${message.recipientPhone}: ${message.body}`);
    console.log(`[MockSmsProvider] To: ${message.recipientPhone} | Body: ${message.body}`);
  }
}

// SMS dispatch is available only when a provider is explicitly configured via
// SMS_PROVIDER. No provider is wired up by default, so the SMS channel is
// disabled unless an adapter is introduced.
export function getSmsProvider(): SmsProvider | null {
  const configured = (process.env.SMS_PROVIDER || '').toLowerCase();
  if (!configured) return null;
  if (configured === 'mock') return new MockSmsProvider();
  console.warn(`[NotificationService] Unsupported SMS_PROVIDER "${configured}"; SMS dispatch disabled`);
  return null;
}