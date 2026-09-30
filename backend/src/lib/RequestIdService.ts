export class RequestIdService {
  static generate(): string {
    return `req-${crypto.randomUUID().slice(0, 8)}`;
  }
}