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

const SESSION_KEY = "new-project.session";

export function getSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as StoredSession;
}

export function saveSession(session: StoredSession) {
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  window.sessionStorage.removeItem(SESSION_KEY);
}
