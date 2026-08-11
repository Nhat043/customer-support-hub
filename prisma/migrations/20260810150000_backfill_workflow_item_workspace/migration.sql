-- Every customer request belongs to a workspace. Existing unscoped records move
-- into their organization's default General workspace without altering request data.
UPDATE "WorkflowItem" AS item
SET "workspaceId" = workspace."id"
FROM "Workspace" AS workspace
WHERE item."workspaceId" IS NULL
  AND workspace."organizationId" = item."organizationId"
  AND workspace."slug" = 'general';

UPDATE "Session" AS session
SET "workspaceId" = workspace."id"
FROM "Workspace" AS workspace
WHERE session."workspaceId" IS NULL
  AND session."organizationId" = workspace."organizationId"
  AND workspace."slug" = 'general';
