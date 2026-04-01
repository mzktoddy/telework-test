import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function handleLogout(_request: NextRequest): Promise<NextResponse> {
  try {
    const cookieStore = await cookies();
    cookieStore.delete("session");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Logout handler error:", error);
    return NextResponse.json(
      { error: "ログアウト処理中にエラーが発生しました" },
      { status: 500 }
    );
  }
}
