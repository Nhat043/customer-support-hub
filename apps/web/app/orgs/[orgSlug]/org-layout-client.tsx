"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { AgentDrawer } from "@/components/agent-drawer";
import { apiFetch, API_ORIGIN } from "@/lib/api";
import { clearSession, getSession, type StoredSession } from "@/lib/auth";

type Notification = {
  id: string;
  title: string;
  body: string;
  type: "REQUEST_ASSIGNED" | "REQUEST_STATUS_CHANGED" | "COMMENT_ADDED" | "SLA_DUE_SOON" | "SLA_OVERDUE";
  workflowItemId: string | null;
  readAt: string | null;
  createdAt: string;
};

export function OrgLayoutClient({ children, orgSlug }: Readonly<{ children: React.ReactNode; orgSlug: string }>) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<StoredSession | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);
  const role = session?.activeMembershipRole;
  const canManageTeam = role === "OWNER" || role === "ADMIN";
  const unreadNotificationCount = notifications.filter((item) => !item.readAt).length;
  const roleLabel = role === "OWNER" ? "Workspace owner" : role ? `${role.charAt(0)}${role.slice(1).toLowerCase()}` : "Loading role";
  const accountInitials = session?.user.fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((name) => name[0])
    .join("")
    .toUpperCase() ?? "?";

  function navigationClass(path: string, matchNested = false) {
    const isActive = matchNested ? pathname.startsWith(path) : pathname === path;
    return `btn secondary${isActive ? " nav-link-active" : ""}`;
  }

  useEffect(() => {
    setSession(getSession());
  }, []);

  useEffect(() => {
    if (!session) return;
    let active = true;
    const loadNotifications = () => {
      void apiFetch<Notification[]>(`/orgs/${orgSlug}/notifications`, { accessToken: session.accessToken })
        .then((items) => { if (active) setNotifications(items); })
        .catch(() => undefined);
    };
    loadNotifications();
    const interval = window.setInterval(loadNotifications, 30_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [orgSlug, session]);

  useEffect(() => {
    const openAssistant = () => setShowAssistant(true);
    window.addEventListener("open-support-copilot", openAssistant);
    return () => window.removeEventListener("open-support-copilot", openAssistant);
  }, []);

  useEffect(() => {
    if (!session) return;
    const socket = io(`${API_ORIGIN}/workspace`, {
      auth: { accessToken: session.accessToken },
      transports: ["websocket"]
    });
    socket.on("connect", () => socket.emit("workspace.subscribe", { orgSlug }));
    socket.on("workspace.changed", (change: { organizationId: string }) => {
      window.dispatchEvent(new CustomEvent("workspace-data-changed", { detail: change }));
    });
    return () => {
      socket.disconnect();
    };
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
      setShowAccountMenu(false);
      router.push("/login");
    }
  }

  async function markAllNotificationsRead() {
    if (!session) return;
    try {
      await apiFetch(`/orgs/${orgSlug}/notifications/read`, {
        method: "PATCH",
        accessToken: session.accessToken
      });
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((item) => item.readAt ? item : { ...item, readAt }));
    } catch {
      // Keep items unread when the server cannot persist the update.
    }
  }

  async function openNotification(notification: Notification) {
    if (session && !notification.readAt) {
      try {
        await apiFetch(`/orgs/${orgSlug}/notifications/${notification.id}/read`, {
          method: "PATCH",
          accessToken: session.accessToken
        });
        setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item));
      } catch {
        // Navigation remains available when the best-effort read update fails.
      }
    }
    setShowNotifications(false);
    if (notification.workflowItemId) router.push(`/orgs/${orgSlug}/workflow-items/${notification.workflowItemId}`);
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
          </div>
          <div className="app-header-actions">
            <nav className="app-navigation" aria-label="Workspace navigation">
              <Link className={navigationClass(`/orgs/${orgSlug}/dashboard`)} href={`/orgs/${orgSlug}/dashboard`}>Overview</Link>
              <Link className={navigationClass(`/orgs/${orgSlug}/workflow-items`, true)} href={`/orgs/${orgSlug}/workflow-items`}>Customer requests</Link>
              <Link className={navigationClass(`/orgs/${orgSlug}/knowledge`, true)} href={`/orgs/${orgSlug}/knowledge`}>Knowledge base</Link>
              {canManageTeam ? <Link className={navigationClass(`/orgs/${orgSlug}/team`, true)} href={`/orgs/${orgSlug}/team`}>Team and roles</Link> : null}
              <button
                className={`btn secondary notification-nav-button${showNotifications ? " nav-link-active" : ""}`}
                type="button"
                aria-label={unreadNotificationCount ? `Notifications, ${unreadNotificationCount} unread` : "Notifications"}
                onClick={() => {
                setShowNotifications((value) => !value);
                setShowAccountMenu(false);
              }}>
                Notifications
                {unreadNotificationCount ? <span className="notification-unread-badge" aria-hidden="true">!</span> : null}
              </button>
              {canManageTeam ? <Link className={navigationClass(`/orgs/${orgSlug}/settings`, true)} href={`/orgs/${orgSlug}/settings`}>Settings</Link> : null}
            </nav>
            <div className="app-account-menu">
              <button
                className="app-account-trigger"
                type="button"
                aria-expanded={showAccountMenu}
                aria-haspopup="menu"
                onClick={() => {
                  setShowAccountMenu((value) => !value);
                  setShowNotifications(false);
                }}
              >
                <span className="app-role-label">{roleLabel}</span>
                <span className="app-account-chevron" aria-hidden="true">⌄</span>
              </button>
              {showAccountMenu ? (
                <section className="app-account-popover" role="menu" aria-label="Account menu">
                  <div className="app-account-popover-profile">
                    <span className="app-account-avatar" aria-hidden="true">{accountInitials}</span>
                    <div>
                      <strong>{session?.user.fullName ?? "Account"}</strong>
                      <small>{session?.user.email ?? ""}</small>
                      <span className="app-role-label">{roleLabel}</span>
                    </div>
                  </div>
                  <Link className="app-account-menu-item" href="/forgot-password" onClick={() => setShowAccountMenu(false)}>
                    Change password
                  </Link>
                  <button className="app-account-menu-item danger" type="button" onClick={() => void logout()}>
                    Logout
                  </button>
                </section>
              ) : null}
            </div>
          </div>
          {showNotifications ? (
            <section className="notification-popover" aria-label="Notifications">
              <div className="notification-popover-heading">
                <h3>Notifications</h3>
                {unreadNotificationCount ? <button className="text-link" type="button" onClick={() => void markAllNotificationsRead()}>Mark all as read</button> : null}
              </div>
              {notifications.length ? (
                <div className="notification-list">
                  {notifications.map((item) => (
                    <button className={`notification-item${item.readAt ? "" : " unread"}`} key={item.id} type="button" onClick={() => void openNotification(item)}>
                      <span className={`notification-type notification-${item.type.toLowerCase()}`}>{notificationTypeLabel(item.type)}</span>
                      <strong>{item.title}</strong>
                      <span>{item.body}</span>
                      <small>{new Date(item.createdAt).toLocaleString()}</small>
                    </button>
                  ))}
                </div>
              ) : <p className="muted">You are all caught up.</p>}
            </section>
          ) : null}
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

function notificationTypeLabel(type: Notification["type"]) {
  return {
    REQUEST_ASSIGNED: "Assigned",
    REQUEST_STATUS_CHANGED: "Status updated",
    COMMENT_ADDED: "New comment",
    SLA_DUE_SOON: "Due soon",
    SLA_OVERDUE: "Overdue"
  }[type];
}
