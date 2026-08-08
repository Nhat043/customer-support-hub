export type OrganizationRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

export type WorkflowStatus =
  | "NEW"
  | "TRIAGE"
  | "IN_PROGRESS"
  | "WAITING"
  | "RESOLVED"
  | "CLOSED";

export type WorkflowPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export type AuthSession = {
  accessToken: string;
  user: {
    id: string;
    email: string;
    fullName: string;
  };
};
