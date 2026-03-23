import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = process.env.JWT_SECRET || "default-secret-change-in-production";
const secret = new TextEncoder().encode(JWT_SECRET);
const COOKIE_NAME = "session";

// Public routes that don't require authentication
const publicRoutes = ["/login", "/api/auth/login"];
const protectedRoutes = ["/reports", "/review", "/approve", "/admin", "/"];

// Role-based route restrictions
const roleRoutes: Record<string, string[]> = {
  "/admin": ["admin"],
  "/approve": ["manager", "admin"],
  "/review": ["reviewer", "admin"],
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (publicRoutes.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Allow static files and Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/") ||
    pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|webp|txt|pdf)$/)
  ) {
    return NextResponse.next();
  }

  // Check for session token
  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const verified = await jwtVerify(token, secret);
    const role = verified.payload.role as string;

    // Check role-based access
    const routeRoles = Object.entries(roleRoutes).find(([route]) =>
      pathname.startsWith(route)
    )?.[1];

    if (routeRoles && !routeRoles.includes(role)) {
      // User doesn't have the required role
      return NextResponse.redirect(new URL("/", request.url));
    }

    // Pass user info in response header for downstream components
    const response = NextResponse.next();
    response.headers.set("x-user-role", role);
    response.headers.set("x-user-id", verified.payload.sub as string);

    return response;
  } catch (error) {
    console.error("Middleware JWT verification failed:", error);
    // Invalid or expired token
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete(COOKIE_NAME);
    return response;
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - static files (images, fonts, etc.)
     * - Next.js internals
     * - Public auth routes
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg)$).*)",
  ],
};
