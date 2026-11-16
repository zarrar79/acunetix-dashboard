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

      setSuccess(`Added ${payload.target?.address || address}`);
      setAddress("");
      onCreated?.();
    } catch {
      setError("Could not reach the dashboard API");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rise max-w-xl rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-3 backdrop-blur">
      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
      >
        <input
          required
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="Add target address"
          aria-label="Address"
          className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-white/80 px-3 py-2 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_20%,transparent)]"
        />
        <button
          type="submit"
          disabled={loading || !address.trim()}
          className="shrink-0 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[var(--accent-deep)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Adding…" : "Add"}
        </button>
      </form>

      {error ? (
        <p className="mt-2 text-xs text-[var(--danger)]">{error}</p>
      ) : null}
      {success ? (
        <p className="mt-2 text-xs text-[var(--ok)]">{success}</p>
      ) : null}
    </section>
  );
}
