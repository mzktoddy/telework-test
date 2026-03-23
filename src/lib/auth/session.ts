import { jwtVerify, SignJWT, type JWTPayload } from "jose";
import { cookies } from "next/headers";

const JWT_SECRET = process.env.JWT_SECRET || "default-secret-change-in-production";
const secret = new TextEncoder().encode(JWT_SECRET);
const COOKIE_NAME = "session";
const COOKIE_EXPIRY_DAYS = 7;

export interface SessionPayload extends JWTPayload {
  sub: string; // userId
  role: string;
}

export async function createSession(userId: string, role: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const expirySeconds = COOKIE_EXPIRY_DAYS * 24 * 60 * 60;
  const exp = now + expirySeconds;

  const payload: SessionPayload = {
    sub: userId,
    role,
  };

  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(secret);

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: expirySeconds,
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;

    if (!token) {
      return null;
    }

    const verified = await jwtVerify(token, secret);
    const payload = verified.payload as SessionPayload;

    // Validate required fields
    if (!payload.sub || !payload.role) {
      return null;
    }

    return payload;
  } catch (error) {
    console.error("Session verification failed:", error);
    return null;
  }
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
