import { OrgLayoutClient } from "./org-layout-client";

type OrgLayoutProps = Readonly<{
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}>;

export default async function OrgLayout({ children, params }: OrgLayoutProps) {
  const { orgSlug } = await params;

  return <OrgLayoutClient orgSlug={orgSlug}>{children}</OrgLayoutClient>;
}
