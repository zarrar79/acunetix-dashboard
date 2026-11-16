"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
          code?: string;
          traceId?: string;
        } | null;
        const base = data?.error || "Login failed";
        setError(
          data?.code && data?.traceId
            ? `${base} [${data.code} · ${data.traceId}]`
            : base,
        );
        setLoading(false);
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Could not reach the dashboard server");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm text-[var(--muted)]">
        Password
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="field w-full px-4 py-3 text-base"
          placeholder="Dashboard password"
        />
      </label>

      {error ? (
        <p className="rounded-lg border border-[color-mix(in_srgb,var(--danger)_45%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_12%,var(--panel))] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={loading}
        className="rounded-xl bg-[var(--accent)] px-4 py-3 text-base font-semibold text-[#06261c] transition hover:bg-[var(--accent-deep)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Signing in…" : "Open dashboard"}
      </button>
    </form>
  );
}
