import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env' });

// terminal only holds the public key issued by shared-user — it can verify
// JWTs but cannot sign new ones (no privateKey configured).
export const jwtConstants = {
  algorithm: 'RS256' as const,
  publicKey: process.env.JWT_PUBLIC_KEY?.replace(/\\n/g, '\n'),
};

export enum AccountVerificationType {
  MAIL = 'mail',
  PHONE_NUMBER = 'phone-number',
}

export enum AccountVerificationStatus {
  VERIFIED = 'verified',
  UNVERIFIED = 'unverified',
}
