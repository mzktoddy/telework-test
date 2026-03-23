"use server";

import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema/users";
import { eq } from "drizzle-orm";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, deleteSession } from "@/lib/auth/session";

export async function loginAction(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  // Basic validation
  if (!email || !password) {
    return { error: "メールアドレスとパスワードを入力してください" };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "有効なメールアドレスを入力してください" };
  }

  try {
    // Query user by email
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user) {
      return { error: "メールアドレスまたはパスワードが正しくありません" };
    }

    // Verify password
    const passwordMatch = await verifyPassword(password, user.passwordHash);

    if (!passwordMatch) {
      return { error: "メールアドレスまたはパスワードが正しくありません" };
    }

    if (!user.isActive) {
      return { error: "このアカウントは無効です" };
    }

    // Create session
    await createSession(user.id, user.role);

    // Redirect based on role
    const roleDashboards: Record<string, string> = {
      admin: "/admin/employees",
      manager: "/approve",
      reviewer: "/review",
      employee: "/reports",
    };

    const redirectUrl = roleDashboards[user.role] || "/";
    redirect(redirectUrl);
  } catch (error) {
    console.error("Login error:", error);
    return { error: "ログイン処理中にエラーが発生しました" };
  }
}

export async function logoutAction() {
  await deleteSession();
  redirect("/login");
}
