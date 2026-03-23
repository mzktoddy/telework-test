import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import LoginForm from "@/components/forms/login-form";

export const metadata = {
  title: "ログイン | 在宅勤務報告システム",
  description: "在宅勤務報告システムへのログイン",
};

export default async function LoginPage() {
  // If user is already logged in, redirect to dashboard
  const session = await getSession();
  if (session) {
    redirect("/");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4 py-12">
      <div className="w-full max-w-md">
        <LoginForm />
      </div>
    </div>
  );
}