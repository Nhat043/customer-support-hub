"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { clearSession, getSession } from "@/lib/auth";

export default function OrgLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const params = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const role = getSession()?.activeMembershipRole;
  const canManageTeam = role === "OWNER" || role === "ADMIN";

  async function logout() {
    const session = getSession();
    try {
      if (session) {
        await apiFetch("/auth/logout", {
          method: "POST",
          accessToken: session.accessToken,
          skipRefresh: true
        });
      }
    } finally {
      clearSession();
      router.push("/login");
    }
  }

  return (
    <main className="page-shell">
      <div className="container grid" style={{ gap: 24 }}>
        <header className="app-header">
          <div className="app-brand">
            <Link className="app-brand-link" href={`/orgs/${params.orgSlug}/dashboard`}>
              <span className="brand-mark" aria-hidden="true">CS</span>
              <span>
                <strong>Customer Support Hub</strong>
                <small>Your company support workspace</small>
              </span>
            </Link>
            <span className="app-role-label">
              {role === "OWNER" ? "Workspace owner" : role ? `${role.charAt(0)}${role.slice(1).toLowerCase()}` : "Workspace"}
            </span>
          </div>
          <nav className="app-navigation" aria-label="Workspace navigation">
            <Link className="btn secondary" href={`/orgs/${params.orgSlug}/dashboard`}>
              Overview
            </Link>
            <Link className="btn secondary" href={`/orgs/${params.orgSlug}/workflow-items`}>
              Customer requests
            </Link>
            <Link className="btn secondary" href={`/orgs/${params.orgSlug}/agent`}>
              AI helper
            </Link>
            {canManageTeam ? (
              <Link className="btn secondary" href={`/orgs/${params.orgSlug}/team`}>
                Team and roles
              </Link>
            ) : null}
            {canManageTeam ? (
              <Link className="btn secondary" href={`/orgs/${params.orgSlug}/settings`}>
                Settings
              </Link>
            ) : null}
            <button className="btn secondary" type="button" onClick={() => void logout()}>
              Logout
            </button>
          </nav>
        </header>
        {children}
      </div>
    </main>
  );
}
