"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { saveSession } from "@/lib/auth";
import Link from "next/link";
import { PublicHeader } from "@/components/public-header";

export default function RegisterPage() {
  return (
    <Suspense fallback={<main className="page-shell" />}>
      <RegisterContent />
    </Suspense>
  );
}

function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const invitationToken = searchParams.get("invitation");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [invitationEmail, setInvitationEmail] = useState("");
  const [invitationLoading, setInvitationLoading] = useState(Boolean(invitationToken));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!invitationToken) return;
    let active = true;
    void apiFetch<{ email: string }>(`/invitations/${encodeURIComponent(invitationToken)}`)
      .then((invitation) => {
        if (!active) return;
        setInvitationEmail(invitation.email);
        setEmail(invitation.email);
      })
      .catch(() => {
        if (active) setError("This invitation is invalid, expired, or has already been used.");
      })
      .finally(() => {
        if (active) setInvitationLoading(false);
      });
    return () => {
      active = false;
    };
  }, [invitationToken]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (invitationToken && (!invitationEmail || invitationLoading)) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<{
        accessToken: string;
        sessionId: string;
        activeOrganizationSlug: string | null;
        activeMembershipRole: import("@/lib/auth").MembershipRole | null;
        user: { id: string; email: string; fullName: string };
      }>("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          fullName,
          email,
          password,
          organizationName: invitationToken ? undefined : organizationName,
          invitationToken: invitationToken ?? undefined
        })
      });
      saveSession({
        accessToken: result.accessToken,
        sessionId: result.sessionId,
        activeOrganizationSlug: result.activeOrganizationSlug,
        activeMembershipRole: result.activeMembershipRole,
        user: result.user
      });
      router.push(`/orgs/${result.activeOrganizationSlug ?? "demo"}/dashboard`);
    } catch (registerError) {
      setError(registerError instanceof Error ? registerError.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="public-page">
      <div className="public-container">
        <PublicHeader
          helperText="Already have an account?"
          actionHref={invitationToken ? `/login?invitation=${encodeURIComponent(invitationToken)}` : "/login"}
          actionLabel="Sign in"
        />
        <section className="setup-panel">
          <Link className="back-link" href="/">Back to home</Link>
          <div className="badge">{invitationToken ? "Team invitation" : "For company owners"}</div>
          <h1>{invitationToken ? "Join your team workspace" : "Create your company workspace"}</h1>
          <p className="muted setup-description">
            {invitationToken
              ? "Create your account with the email address that received the invitation."
              : "You will become the workspace owner. Use this page only when setting up Customer Support Hub for a new company."}
          </p>
          <form className="grid" onSubmit={submit}>
            <label className="grid">
              <span>Full name</span>
              <input className="input" placeholder="Your full name" value={fullName} onChange={(event) => setFullName(event.target.value)} required minLength={2} autoComplete="name" />
            </label>
            <label className="grid">
              <span>{invitationToken ? "Invitation email" : "Work email"}</span>
              <input
                className="input"
                type="email"
                placeholder="Work email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
                readOnly={Boolean(invitationToken)}
                aria-readonly={Boolean(invitationToken)}
              />
            </label>
            {invitationToken && invitationEmail ? <p className="muted">This email is locked to the invitation recipient.</p> : null}
            <label className="grid">
              <span>Create a password</span>
              <input className="input" type="password" placeholder="Create a password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} autoComplete="new-password" />
            </label>
            {!invitationToken ? (
              <label className="grid">
                <span>Company name</span>
                <input className="input" placeholder="Company name" value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} required minLength={2} />
              </label>
            ) : null}
            {error ? <p className="form-error">We could not create this account. Check the details and try again.</p> : null}
            <button className="btn primary" disabled={loading || invitationLoading || Boolean(invitationToken && !invitationEmail)} type="submit">
              {invitationLoading ? "Checking invitation..." : loading ? "Creating..." : invitationToken ? "Create account and join team" : "Create company workspace"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
