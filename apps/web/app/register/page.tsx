import { RegisterContent } from "./register-content";

type RegisterPageProps = {
  searchParams: Promise<{ invitation?: string | string[] }>;
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const params = await searchParams;
  const invitationToken = typeof params.invitation === "string" ? params.invitation : null;

  return <RegisterContent invitationToken={invitationToken} />;
}
