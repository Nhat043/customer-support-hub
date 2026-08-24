export type MembershipRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

export type StoredSession = {
  accessToken: string;
  sessionId?: string;
  activeOrganizationSlug?: string | null;
  activeMembershipRole?: MembershipRole | null;
  user: {
    id: string;
    email: string;
    fullName: string;
  };
};

const SESSION_KEY = "customer-support-hub.session";

export function getSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SESSION_KEY) ?? window.sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  try {
    const session = JSON.parse(raw) as StoredSession;
    // Migrate sessions created before persistent login was introduced.
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    window.sessionStorage.removeItem(SESSION_KEY);
    return session;
  } catch {
    clearSession();
    return null;
  }
}

export function saveSession(session: StoredSession) {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  window.sessionStorage.removeItem(SESSION_KEY);
}

export function clearSession() {
  window.localStorage.removeItem(SESSION_KEY);
  window.sessionStorage.removeItem(SESSION_KEY);
}
