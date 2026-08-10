"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { clearSession, getSession } from "@/lib/auth";
import { AgentDrawer } from "@/components/agent-drawer";

export default function OrgLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const params = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const role = getSession()?.activeMembershipRole;
  const canManageTeam = role === "OWNER" || role === "ADMIN";
  const [notifications, setNotifications] = useState<Array<{ id: string; title: string; body: string; readAt: string | null }>>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);

  useEffect(() => {
    const session = getSession();
    if (!session || !params.orgSlug) return;
    void apiFetch<Array<{ id: string; title: string; body: string; readAt: string | null }>>(`/orgs/${params.orgSlug}/notifications`, { accessToken: session.accessToken }).then(setNotifications).catch(() => undefined);
  }, [params.orgSlug]);

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
            <button className="btn secondary" type="button" onClick={() => setShowAssistant(true)}>
              AI assistant
            </button>
            {canManageTeam ? (
              <Link className="btn secondary" href={`/orgs/${params.orgSlug}/team`}>
                Team and roles
              </Link>
            ) : null}
            <button className="btn secondary" type="button" onClick={() => setShowNotifications((value) => !value)}>
              Notifications{notifications.filter((item) => !item.readAt).length ? ` (${notifications.filter((item) => !item.readAt).length})` : ""}
            </button>
            {canManageTeam ? (
              <Link className="btn secondary" href={`/orgs/${params.orgSlug}/settings`}>
                Settings
              </Link>
            ) : null}
            <button className="btn secondary" type="button" onClick={() => void logout()}>
              Logout
            </button>
          </nav>
          {showNotifications ? <section className="card" style={{ position: "absolute", right: 24, top: 96, width: 340, zIndex: 2 }}><h3>Notifications</h3>{notifications.length ? notifications.map((item) => <article key={item.id} className="card"><strong>{item.title}</strong><p className="muted">{item.body}</p></article>) : <p className="muted">You are all caught up.</p>}</section> : null}
        </header>
        {children}
        {showAssistant ? <AgentDrawer orgSlug={params.orgSlug} onClose={() => setShowAssistant(false)} /> : null}
      </div>
    </main>
  );
}
