"use client";

import { FormEvent, useState } from "react";

type AddTargetFormProps = {
  onCreated?: () => void;
};

export function AddTargetForm({ onCreated }: AddTargetFormProps) {
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const payload = (await response.json()) as {
        error?: string;
        target?: { target_id?: string; address?: string };
        scanId?: string;
      };

      if (!response.ok) {
        setError(payload.error || "Failed to add target");
        setLoading(false);
        return;
      }

      setSuccess(`Target added: ${payload.target?.address || address}`);
      setAddress("");
      onCreated?.();
    } catch {
      setError("Could not reach the dashboard API");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rise rise-delay-1 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 backdrop-blur sm:p-5">
      <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
        Add target
      </h2>

      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-sm text-[var(--muted)]">
          Address
          <input
            required
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="https://example.com"
            className="rounded-xl border border-[var(--line)] bg-white/80 px-4 py-3 text-base text-[var(--ink)] outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--accent)_20%,transparent)]"
          />
        </label>

        {error ? (
          <p className="rounded-lg bg-[#fdecea] px-3 py-2 text-sm text-[var(--danger)]">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="rounded-lg bg-[#e8f6ee] px-3 py-2 text-sm text-[var(--ok)]">
            {success}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loading || !address.trim()}
          className="rounded-xl bg-[var(--accent)] px-4 py-3 text-base font-semibold text-white transition hover:bg-[var(--accent-deep)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Adding target…" : "Add target"}
        </button>
      </form>
    </section>
  );
}
