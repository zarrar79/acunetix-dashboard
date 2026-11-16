"use client";

import { FormEvent, useRef, useState } from "react";

type AddTargetFormProps = {
  onCreated?: () => void;
};

type ApiErrorPayload = {
  error?: string;
  code?: string;
  traceId?: string;
  target?: { address?: string };
  succeeded?: number;
  total?: number;
  failed?: number;
};

function formatError(payload: ApiErrorPayload, fallback: string) {
  const base = payload.error || fallback;
  if (payload.code && payload.traceId) {
    return `${base} [${payload.code} · ${payload.traceId}]`;
  }
  if (payload.traceId) return `${base} [${payload.traceId}]`;
  return base;
}

export function AddTargetForm({ onCreated }: AddTargetFormProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [address, setAddress] = useState("");
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
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
      const payload = (await response.json()) as ApiErrorPayload;

      if (!response.ok) {
        setError(formatError(payload, "Failed to add target"));
        setLoading(false);
        return;
      }

      setSuccess(`Added ${payload.target?.address || address}`);
      setAddress("");
      onCreated?.();
    } catch {
      setError(
        "Network error while adding target. Check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function onBulkUpload(file: File) {
    setBulkLoading(true);
    setError("");
    setSuccess("");
    setFileName(file.name);

    try {
      const form = new FormData();
      form.append("file", file);

      const response = await fetch("/api/targets/bulk", {
        method: "POST",
        body: form,
      });
      const payload = (await response.json()) as ApiErrorPayload;

      if (!response.ok) {
        setError(formatError(payload, "Bulk upload failed"));
        setBulkLoading(false);
        return;
      }

      setSuccess(
        `Bulk done: ${payload.succeeded || 0}/${payload.total || 0} started` +
          (payload.failed ? `, ${payload.failed} failed` : ""),
      );
      onCreated?.();
    } catch {
      setError(
        "Network error while uploading URLs. Check your connection and tunnel status.",
      );
    } finally {
      setBulkLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex h-full flex-col justify-center gap-2">
      <form
        onSubmit={onSubmit}
        className="flex items-center gap-2"
      >
        <input
          required
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="Add target address"
          aria-label="Address"
          className="field min-w-0 flex-1 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={loading || bulkLoading || !address.trim()}
          className="shrink-0 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-[#06261c] transition hover:bg-[var(--accent-deep)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Adding…" : "Add"}
        </button>
      </form>

      <div className="flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.csv,text/plain,text/csv"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void onBulkUpload(file);
          }}
        />
        <button
          type="button"
          disabled={loading || bulkLoading}
          onClick={() => fileRef.current?.click()}
          className="rounded-lg border border-[var(--line)] bg-[var(--panel-solid)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {bulkLoading ? "Uploading…" : "Bulk upload"}
        </button>
        <span className="truncate text-[11px] text-[var(--muted)]">
          {fileName || ".txt / .csv"}
        </span>
      </div>

      {error ? (
        <p className="text-xs leading-relaxed text-[var(--danger)]">{error}</p>
      ) : null}
      {success ? (
        <p className="text-xs text-[var(--ok)]">{success}</p>
      ) : null}
    </div>
  );
}
