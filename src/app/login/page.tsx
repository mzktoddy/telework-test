import LoginForm from "@/components/forms/login-form";

// Fully static — redirect for authenticated users is handled in middleware
export const metadata = {
  title: "ログイン | 在宅勤務報告システム",
  description: "在宅勤務報告システムへのログイン",
};

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4 py-12">
      <div className="w-full max-w-md">
        <LoginForm />
      </div>
    </div>
  );
}