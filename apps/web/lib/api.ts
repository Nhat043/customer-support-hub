import { clearSession, getSession, saveSession } from "./auth";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";
export const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, "");

type ApiOptions = RequestInit & {
  accessToken?: string;
  skipRefresh?: boolean;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let refreshPromise: Promise<string | null> | null = null;

function toSafeErrorMessage(status: number) {
  if (status === 401) {
    return "Email or password is incorrect.";
  }
  if (status === 403) {
    return "You do not have permission to do that.";
  }
  if (status === 404) {
    return "We could not find what you requested.";
  }
  if (status === 409) {
    return "This information is already in use.";
  }
  if (status === 429) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (status >= 500) {
    return "Something went wrong on our side. Please try again.";
  }
  return "Please check your information and try again.";
}

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include"
    })
      .then(async (response) => {
        if (!response.ok) return null;
        const result = (await response.json()) as {
          accessToken: string;
          activeOrganizationSlug: string | null;
          activeMembershipRole: import("./auth").MembershipRole | null;
          user: { id: string; email: string; fullName: string };
        };
        const session = getSession();
        if (!session) return null;
        saveSession({
          ...session,
          accessToken: result.accessToken,
          activeOrganizationSlug: result.activeOrganizationSlug,
          activeMembershipRole: result.activeMembershipRole,
          user: result.user
        });
        return result.accessToken;
      })
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
      ...(options.headers ?? {})
    }
  });

  if (response.status === 401 && options.accessToken && !options.skipRefresh) {
    const nextAccessToken = await refreshAccessToken();
    if (nextAccessToken) {
      return apiFetch<T>(path, {
        ...options,
        accessToken: nextAccessToken,
        skipRefresh: true
      });
    }
    clearSession();
  }

  if (!response.ok) {
    throw new ApiError(toSafeErrorMessage(response.status), response.status);
  }

  return (await response.json()) as T;
}
