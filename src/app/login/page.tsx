import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <div className="rise w-full max-w-md rounded-[28px] border border-[var(--line)] bg-[var(--panel)] p-6 shadow-[0_24px_60px_rgba(20,32,27,0.08)] backdrop-blur sm:p-8">
        <p className="font-[family-name:var(--font-display)] text-sm font-semibold tracking-[0.18em] text-[var(--accent-deep)] uppercase">
          Daybreak Scan Desk
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-[var(--ink)]">
          Sign in
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          View live Acunetix scan stats from anywhere. Your Acunetix API key
          never leaves the server.
        </p>
        <div className="mt-6">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
