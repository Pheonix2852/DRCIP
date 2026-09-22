import { v4 as uuidv4 } from 'uuid';

export class RequestIdService {
  static generate(): string {
    return `req-${uuidv4().slice(0, 8)}`;
  }
}