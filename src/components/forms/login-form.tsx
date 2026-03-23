"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { loginAction } from "@/actions/auth";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("メールアドレスとパスワードを入力してください");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.append("email", email);
      formData.append("password", password);

      const result = await loginAction(formData);

      if (result?.error) {
        setError(result.error);
      } else {
        router.push("/");
        router.refresh();
      }
    });
  };

  return (
    <Card className="shadow-lg">
      <CardHeader className="space-y-4 text-center pt-8">
        <div className="flex justify-center mb-2">
          <div className="bg-blue-900 text-white rounded-lg p-3">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C6.5 6.253 2 10.998 2 17s4.5 10.747 10 10.747c5.5 0 10-4.998 10-10.747 0-6.002-4.5-10.747-10-10.747z" />
            </svg>
          </div>
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">テレワーク・プロ</h1>
          <p className="text-xs text-gray-500 mt-1">社内報告システム</p>
        </div>
        <div className="pt-4">
          <CardTitle className="text-xl font-bold">ログイン</CardTitle>
          <CardDescription className="text-xs mt-1">
            プロフェッショナルなワークスペースにアクセス
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pb-8">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-xs font-medium">ユーザー名</Label>
            <Input
              id="email"
              type="email"
              placeholder="user@telework.pro"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isPending}
              required
              className="h-10"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-xs font-medium">パスワード</Label>
              <a href="#" className="text-xs text-blue-600 hover:text-blue-700">
                パスワードをお忘れですか?
              </a>
            </div>
            <Input
              id="password"
              type="password"
              placeholder="パスワードを入力"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isPending}
              required
              className="h-10"
            />
          </div>

          <div className="flex items-center space-x-2 py-1">
            <input
              type="checkbox"
              id="rememberMe"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              disabled={isPending}
              className="rounded border-gray-300"
            />
            <Label htmlFor="rememberMe" className="text-xs text-gray-600 cursor-pointer">
              ログイン状態を保持する
            </Label>
          </div>

          {error && (
            <div className="text-sm text-destructive text-center bg-red-50 p-3 rounded-md">
              {error}
            </div>
          )}

          <Button
            type="submit"
            className="w-full h-11 bg-gray-900 hover:bg-gray-800 text-white font-medium rounded-full"
            disabled={isPending}
          >
            {isPending ? "サインイン中..." : "サインイン →"}
          </Button>
        </form>

        <div className="text-center text-xs text-gray-600 space-y-2">
          <p>お困りですか? <a href="#" className="text-blue-600 hover:text-blue-700">サポートに問い合わせる</a></p>
        </div>

        <div className="pt-4 border-t border-gray-200 text-center">
          <p className="text-xs text-gray-500">© 2024 Telework Pro System. All rights reserved.</p>
          <p className="text-xs text-gray-500 mt-1"><a href="#" className="hover:text-gray-700">プライバシーポリシー</a></p>
        </div>
      </CardContent>
    </Card>
  );
}
