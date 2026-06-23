import { SignJWT, jwtVerify } from 'jose';
import { getAuthSecret } from '@/lib/auth/constants';

export type ReachPrintTokenPayload = {
  certificateId?: string;
  clientId?: string;
  chemicalId?: string;
  registrationNumber?: string;
  issuedDate?: string;
  validatedDate?: string;
  tonnageBand?: string | null;
};

const TOKEN_TTL = '2m';

export async function createReachPrintToken(payload: ReachPrintTokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(getAuthSecret());
}

export async function verifyReachPrintToken(
  token: string
): Promise<ReachPrintTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getAuthSecret());
    return {
      certificateId: typeof payload.certificateId === 'string' ? payload.certificateId : undefined,
      clientId: typeof payload.clientId === 'string' ? payload.clientId : undefined,
      chemicalId: typeof payload.chemicalId === 'string' ? payload.chemicalId : undefined,
      registrationNumber:
        typeof payload.registrationNumber === 'string' ? payload.registrationNumber : undefined,
      issuedDate: typeof payload.issuedDate === 'string' ? payload.issuedDate : undefined,
      validatedDate: typeof payload.validatedDate === 'string' ? payload.validatedDate : undefined,
      tonnageBand:
        payload.tonnageBand === null || typeof payload.tonnageBand === 'string'
          ? (payload.tonnageBand as string | null)
          : undefined,
    };
  } catch {
    return null;
  }
}
