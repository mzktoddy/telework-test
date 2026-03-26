import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { users } from "@/db/schema/users";
import { eq } from "drizzle-orm";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    // Basic validation
    if (!email || !password) {
      return NextResponse.json(
        { error: "メールアドレスとパスワードを入力してください" },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "有効なメールアドレスを入力してください" },
        { status: 400 }
      );
    }

    const db = await getDb();
    // Query user by email
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user) {
      return NextResponse.json(
        { error: "メールアドレスまたはパスワードが正しくありません" },
        { status: 401 }
      );
    }

    // Verify password
    const passwordMatch = await verifyPassword(password, user.passwordHash);

    if (!passwordMatch) {
      return NextResponse.json(
        { error: "メールアドレスまたはパスワードが正しくありません" },
        { status: 401 }
      );
    }

    if (!user.isActive) {
      return NextResponse.json(
        { error: "このアカウントは無効です" },
        { status: 403 }
      );
    }

    // Create session
    await createSession(user.id, user.role);

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      redirect: getRoleDashboard(user.role),
    });
  } catch (error) {
    console.error("Login API error:", error);
    return NextResponse.json(
      { error: "ログイン処理中にエラーが発生しました" },
      { status: 500 }
    );
  }
}

function getRoleDashboard(role: string): string {
  const roleDashboards: Record<string, string> = {
    admin: "/admin/employees",
    manager: "/approve",
    reviewer: "/review",
    employee: "/reports",
  };
  return roleDashboards[role] || "/";
}