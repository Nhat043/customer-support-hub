import { WorkflowItemsContent } from "./workflow-items-content";

type WorkflowItemsPageProps = {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ status?: string | string[]; priority?: string | string[]; q?: string | string[] }>;
};

function firstValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default async function WorkflowItemsPage({ params, searchParams }: WorkflowItemsPageProps) {
  const [{ orgSlug }, query] = await Promise.all([params, searchParams]);

  return (
    <WorkflowItemsContent
      orgSlug={orgSlug}
      filters={{
        status: firstValue(query.status),
        priority: firstValue(query.priority),
        query: firstValue(query.q).toLowerCase()
      }}
    />
  );
}
