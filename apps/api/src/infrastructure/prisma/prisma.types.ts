// Prisma generates its client into apps/api/node_modules/.prisma/client (see the
// generator output in prisma/schema.prisma), which "@prisma/client" does not
// re-export. This barrel is the single place allowed to reference that generated
// path, so the rest of the codebase imports model types from a stable module.
export * from "../../../node_modules/.prisma/client";
