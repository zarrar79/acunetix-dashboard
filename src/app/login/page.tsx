import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <div className="rise w-full max-w-md rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur sm:p-8">
        <p className="font-[family-name:var(--font-mono)] text-[10px] font-semibold tracking-[0.22em] text-[var(--accent)] uppercase">
          Daybreak // secure gate
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-[var(--ink)]">
          Authenticate
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Enter the ops console. Acunetix credentials stay server-side.
        </p>
        <div className="mt-6">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
