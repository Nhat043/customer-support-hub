"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getSession, saveSession, type MembershipRole } from "@/lib/auth";
import { PublicHeader } from "@/components/public-header";

type InvitationPreview = {
  email: string;
  hasAccount: boolean;
  role: MembershipRole;
  expiresAt: string;
  organization: { slug: string; name: string };
};

export default function JoinPage() {
  return (
    <Suspense fallback={<main className="page-shell" />}>
      <JoinContent />
    </Suspense>
  );
}

function JoinContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [invitation, setInvitation] = useState<InvitationPreview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("This invitation link is incomplete.");
      return;
    }
    void apiFetch<InvitationPreview>(`/invitations/${encodeURIComponent(token)}`)
      .then((preview) => {
        if (!getSession() && !preview.hasAccount) {
          router.replace(`/register?invitation=${encodeURIComponent(token)}`);
          return;
        }
        setInvitation(preview);
      })
      .catch((previewError) => setError(previewError instanceof Error ? previewError.message : "This invitation is unavailable."));
  }, [router, token]);

  async function accept() {
    const session = getSession();
    if (!session || !token) return;
    setLoading(true);
    setError("");
    try {
      const accepted = await apiFetch<{
        organization: { slug: string };
        membership: { role: MembershipRole };
      }>("/invitations/accept", {
        method: "POST",
        accessToken: session.accessToken,
        body: JSON.stringify({ token })
      });
      saveSession({
        ...session,
        activeOrganizationSlug: accepted.organization.slug,
        activeMembershipRole: accepted.membership.role
      });
      router.push(`/orgs/${accepted.organization.slug}/dashboard`);
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : "Could not join this workspace.");
    } finally {
      setLoading(false);
    }
  }

  const session = getSession();
  const query = token ? `?invitation=${encodeURIComponent(token)}` : "";

  return (
    <main className="public-page">
      <div className="public-container">
        <PublicHeader actionHref="/login" actionLabel="Sign in" />
        <section className="setup-panel join-panel">
          <Link className="back-link" href="/">Back to home</Link>
          <div className="badge">Team invitation</div>
          <h1>Join a support workspace</h1>
          {invitation ? (
            <>
              <p className="muted" style={{ lineHeight: 1.7 }}>
                You are invited to join <strong>{invitation.organization.name}</strong> as a <strong>{invitation.role.toLowerCase()}</strong>.
              </p>
              <p className="muted">This invitation was sent to {invitation.email}.</p>
              {session ? (
                <button className="btn primary" disabled={loading} onClick={() => void accept()} type="button">
                  {loading ? "Joining..." : "Join workspace"}
                </button>
              ) : (
                <Link className="btn primary" href={`/login${query}`}>Sign in to join</Link>
              )}
            </>
          ) : (
            <p className="muted">Checking your invitation...</p>
          )}
          {error ? <p className="form-error">This invitation cannot be used right now. Check the link or ask your workspace owner for a new invitation.</p> : null}
        </section>
      </div>
    </main>
  );
}
