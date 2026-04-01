import { NextRequest, NextResponse } from "next/server";
import { handleLogin, handleGetSession, handleLogout } from "../handlers";

type RouteParams = { params: Promise<{ action: string }> };

// POST /api/auth/[action]
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { action } = await params;

  switch (action) {
    case "login":
      return handleLogin(request);
    case "logout":
      return handleLogout(request);
    default:
      return NextResponse.json(
        { error: `Unknown action: ${action}` },
        { status: 404 }
      );
  }
}

// GET /api/auth/[action]
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { action } = await params;

  switch (action) {
    case "getSession":
      return handleGetSession(request);
    default:
      return NextResponse.json(
        { error: `Unknown action: ${action}` },
        { status: 404 }
      );
  }
}
