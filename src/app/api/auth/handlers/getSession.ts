import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";

export async function handleGetSession(_request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    return NextResponse.json({
      userId: session.sub,
      role: session.role,
    });
  } catch (error) {
    console.error("GetSession handler error:", error);
    return NextResponse.json(
      { error: "Failed to fetch user session" },
      { status: 500 }
    );
  }
}
