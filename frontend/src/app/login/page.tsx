"use client";

import { LifeBuoy, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign-in failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span aria-hidden className="grid h-12 w-12 place-items-center rounded-xl bg-brand text-on-brand shadow-md"><LifeBuoy className="h-6 w-6" /></span>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">XSupport AI</h1>
          <p className="mt-1 text-sm text-muted">Sign in to the helpdesk workspace</p>
        </div>

        <form onSubmit={onSubmit} aria-label="Sign in" className="space-y-4 rounded-lg border border-line bg-panel p-6 shadow-sm" noValidate>
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium">Email</label>
            <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium">Password</label>
            <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy || !email || !password}>{busy ? "Signing in…" : "Sign in"}</Button>
        </form>

        <p className="mt-6 text-center text-xs text-muted">
          <ShieldCheck aria-hidden className="-mt-0.5 mr-1 inline h-3.5 w-3.5" />
          Academic project (StFX MACS). All ticket data is synthetic and does not represent real StFX incidents.
        </p>
      </div>
    </main>
  );
}
