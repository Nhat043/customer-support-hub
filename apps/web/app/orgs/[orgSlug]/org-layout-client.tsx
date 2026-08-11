"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AgentDrawer } from "@/components/agent-drawer";
import { apiFetch } from "@/lib/api";
import { clearSession, getSession, type StoredSession } from "@/lib/auth";

type Notification = { id: string; title: string; body: string; readAt: string | null };

export function OrgLayoutClient({ children, orgSlug }: Readonly<{ children: React.ReactNode; orgSlug: string }>) {
  const router = useRouter();
  const [session, setSession] = useState<StoredSession | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);
  const role = session?.activeMembershipRole;
  const canManageTeam = role === "OWNER" || role === "ADMIN";

  useEffect(() => {
    setSession(getSession());
  }, []);

  useEffect(() => {
    if (!session) return;
    void apiFetch<Notification[]>(`/orgs/${orgSlug}/notifications`, { accessToken: session.accessToken })
      .then(setNotifications)
      .catch(() => undefined);
  }, [orgSlug, session]);

  async function logout() {
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
            <Link className="app-brand-link" href={`/orgs/${orgSlug}/dashboard`}>
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
            <Link className="btn secondary" href={`/orgs/${orgSlug}/dashboard`}>Overview</Link>
            <Link className="btn secondary" href={`/orgs/${orgSlug}/workflow-items`}>Customer requests</Link>
            <Link className="btn secondary" href={`/orgs/${orgSlug}/knowledge`}>Knowledge</Link>
            {canManageTeam ? <Link className="btn secondary" href={`/orgs/${orgSlug}/team`}>Team and roles</Link> : null}
            <button className="btn secondary" type="button" onClick={() => setShowNotifications((value) => !value)}>
              Notifications{notifications.filter((item) => !item.readAt).length ? ` (${notifications.filter((item) => !item.readAt).length})` : ""}
            </button>
            {canManageTeam ? <Link className="btn secondary" href={`/orgs/${orgSlug}/settings`}>Settings</Link> : null}
            <button className="btn secondary" type="button" onClick={() => void logout()}>Logout</button>
          </nav>
          {showNotifications ? <section className="card" style={{ position: "absolute", right: 24, top: 96, width: 340, zIndex: 2 }}><h3>Notifications</h3>{notifications.length ? notifications.map((item) => <article key={item.id} className="card"><strong>{item.title}</strong><p className="muted">{item.body}</p></article>) : <p className="muted">You are all caught up.</p>}</section> : null}
        </header>
        {children}
        {!showAssistant ? (
          <button className="agent-fab" type="button" aria-label="Open AI support assistant" aria-expanded="false" onClick={() => setShowAssistant(true)}>
            <span className="agent-fab-tooltip">Ask Support Copilot</span>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M6.5 18.5 3.8 21v-5.6A7.8 7.8 0 0 1 3 12c0-4.4 4-8 9-8s9 3.6 9 8-4 8-9 8a10.7 10.7 0 0 1-5.5-1.5Z" />
              <path d="m12 7 .7 2.3L15 10l-2.3.7L12 13l-.7-2.3L9 10l2.3-.7L12 7Zm4.2 5.5.4 1.1 1.1.4-1.1.4-.4 1.1-.4-1.1-1.1-.4 1.1-.4.4-1.1Z" />
            </svg>
          </button>
        ) : null}
        {showAssistant ? <AgentDrawer orgSlug={orgSlug} onClose={() => setShowAssistant(false)} /> : null}
      </div>
    </main>
  );
}
