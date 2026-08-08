import type {
  Organization,
  Membership,
  Session,
  User
} from "../../../node_modules/.prisma/client";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      user?: {
        userId: string;
        sessionId: string;
        organizationId?: string;
      };
      organization?: Organization;
      membership?: Membership;
      authSession?: Session;
      currentUser?: User;
    }
  }
}

export {};
