"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { apiFetch } from "@/lib/api";
import { saveSession } from "@/lib/auth";
import Link from "next/link";
import { PublicHeader } from "@/components/public-header";

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="page-shell" />}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const invitationToken = searchParams.get("invitation");
  const resetCompleted = searchParams.get("reset") === "success";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await apiFetch<{
        accessToken: string;
        sessionId: string;
        user: { id: string; email: string; fullName: string };
        activeOrganizationSlug: string | null;
        activeMembershipRole: import("@/lib/auth").MembershipRole | null;
      }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });

      saveSession({
        accessToken: result.accessToken,
        sessionId: result.sessionId,
        activeOrganizationSlug: result.activeOrganizationSlug,
        activeMembershipRole: result.activeMembershipRole,
        user: result.user
      });

      if (invitationToken) {
        const accepted = await apiFetch<{
          organization: { slug: string };
          membership: { role: import("@/lib/auth").MembershipRole };
        }>("/invitations/accept", {
          method: "POST",
          accessToken: result.accessToken,
          body: JSON.stringify({ token: invitationToken })
        });
        saveSession({
          accessToken: result.accessToken,
          sessionId: result.sessionId,
          activeOrganizationSlug: accepted.organization.slug,
          activeMembershipRole: accepted.membership.role,
          user: result.user
        });
        router.push(`/orgs/${accepted.organization.slug}/dashboard`);
        return;
      }

      router.push(`/orgs/${result.activeOrganizationSlug ?? "demo"}/dashboard`);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="public-page">
      <div className="public-container">
        <PublicHeader
          helperText="New company?"
          actionHref="/register"
          actionLabel="Create workspace"
        />
        <div className="auth-layout">
          <section className="auth-intro">
            <Link className="back-link" href="/">Back to home</Link>
            <span className="badge">Your company workspace</span>
            <h1>Pick up where your team left off.</h1>
            <p>
              Sign in to see your company&apos;s customer requests, assignments,
              and shared activity.
            </p>
            <div className="auth-tip">
              <strong>First time here?</strong>
              <span>If your owner invited you, open the invitation link in your email.</span>
            </div>
          </section>

          <section className="auth-panel">
            <div className="auth-panel-heading">
              <p className="eyebrow">Sign in</p>
              <h2>Welcome back</h2>
              <p className="muted">Use the account created for your company workspace.</p>
            </div>
            <form className="grid" onSubmit={handleSubmit}>
            <label className="grid">
              <span>Email</span>
              <input
                className="input"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                required
              />
            </label>

            <label className="grid">
              <span>Password</span>
              <input
                className="input"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="current-password"
                required
              />
            </label>

            <Link className="text-link" href="/forgot-password">
              Forgot your password?
            </Link>

            {error ? <p className="form-error">We could not sign you in. Check your email and password, then try again.</p> : null}
            {resetCompleted ? <p className="form-success">Password updated. Sign in with your new password.</p> : null}
            <button className="btn primary" disabled={loading} type="submit">
              {loading ? "Signing in..." : "Sign in"}
            </button>
            <Link className="text-link" href={invitationToken ? `/register?invitation=${encodeURIComponent(invitationToken)}` : "/register"}>
              {invitationToken ? "Need to create your invited account?" : "Need to create a new company workspace?"}
            </Link>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
