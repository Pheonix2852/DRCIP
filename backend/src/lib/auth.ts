import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { Role } from '@drcip/contracts';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const configuredJwtSecret = process.env.JWT_SECRET;

// Production fail-safe: never fall back to a default secret. Missing/empty
// JWT_SECRET is a startup/configuration error — refuse to boot.
let jwtSecretValue: string;
if (IS_PRODUCTION) {
  if (!configuredJwtSecret || configuredJwtSecret.trim() === '') {
    throw new Error(
      'FATAL: JWT_SECRET is not set. Production requires an explicit JWT_SECRET ' +
        'environment variable. Refusing to fall back to the development default secret. ' +
        'Set JWT_SECRET to a strong random value before starting the server.'
    );
  }
  jwtSecretValue = configuredJwtSecret;
} else {
  // Development/test: retain the historical default so local runs and the
  // existing test setup keep working when the env var is not injected.
  jwtSecretValue =
    configuredJwtSecret || 'dev-jwt-secret-do-not-use-in-production-must-be-32-chars-long';
}

const JWT_SECRET = new TextEncoder().encode(jwtSecretValue);

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  name: string;
  jti: string;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function signToken(payload: JwtPayload, expiresIn = '1h'): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
}

export function isPasswordValid(password: string): { valid: boolean; reason?: string } {
  if (password.length < 8) return { valid: false, reason: 'Password must be at least 8 characters' };
  if (!/[A-Z]/.test(password)) return { valid: false, reason: 'Password must contain an uppercase letter' };
  if (!/[a-z]/.test(password)) return { valid: false, reason: 'Password must contain a lowercase letter' };
  if (!/[0-9]/.test(password)) return { valid: false, reason: 'Password must contain a digit' };
  return { valid: true };
}
