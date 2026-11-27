import type {
  AuthenticatedSession,
  AuthenticatedUser,
  RequestMembership,
  RequestOrganization
} from "./request-context";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      /** Set by JwtGuard. */
      user?: AuthenticatedUser;
      /** Set by JwtGuard. */
      session?: AuthenticatedSession;
      /** Set by OrgGuard. */
      organization?: RequestOrganization;
      /** Set by OrgGuard. */
      membership?: RequestMembership;
    }
  }
}

export {};
