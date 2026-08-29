"use client";
import { useState } from "react";

export function LoginForm({ configured }: { configured: boolean }) {
  const [err, setErr] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr("");
    if (!configured) {
      setErr("admin not configured");
      return;
    }
    const fd = new FormData(e.currentTarget);
    setPending(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: String(fd.get("username") || ""),
          password: String(fd.get("password") || ""),
        }),
      });
      const json = (await res.json()) as { ok?: boolean };
      if (!json.ok) {
        setErr("invalid credentials");
        return;
      }
      window.location.href = "/";
    } catch {
      setErr("invalid credentials");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
      <label className="text-[11px] tracking-[0.14em] text-mute">
        username
        <input
          name="username"
          autoComplete="username"
          className="mt-1 w-full border border-hairline bg-bg px-3 py-1.5 font-mono text-xs text-ink outline-none focus:border-gold"
        />
      </label>
      <label className="text-[11px] tracking-[0.14em] text-mute">
        password
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          className="mt-1 w-full border border-hairline bg-bg px-3 py-1.5 font-mono text-xs text-ink outline-none focus:border-gold"
        />
      </label>
      <button type="submit" disabled={pending} className="chip chip-on tracking-[0.14em]">
        Enter
      </button>
      {err ? <p className="text-sm text-ink">{err}</p> : null}
    </form>
  );
}
