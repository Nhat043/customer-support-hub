import * as bcrypt from "bcryptjs";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { PrismaClient } from "../../../node_modules/.prisma/client";

if (existsSync("../../.env")) {
  loadEnvFile("../../.env");
}

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("Password123!", 12);
  const user = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: { passwordHash, fullName: "Demo Admin", status: "ACTIVE" },
    create: {
      email: "admin@example.com",
      passwordHash,
      fullName: "Demo Admin",
      status: "ACTIVE"
    }
  });

  const organization = await prisma.organization.upsert({
    where: { slug: "demo-org" },
    update: { name: "Demo Organization", status: "ACTIVE" },
    create: {
      slug: "demo-org",
      name: "Demo Organization",
      status: "ACTIVE"
    }
  });

  await prisma.membership.upsert({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId: user.id
      }
    },
    update: { role: "OWNER", status: "ACTIVE" },
    create: {
      organizationId: organization.id,
      userId: user.id,
      role: "OWNER",
      status: "ACTIVE"
    }
  });

  const workspace = await prisma.workspace.upsert({
    where: {
      organizationId_slug: {
        organizationId: organization.id,
        slug: "general"
      }
    },
    update: { name: "General", status: "ACTIVE" },
    create: {
      organizationId: organization.id,
      slug: "general",
      name: "General",
      status: "ACTIVE"
    }
  });

  console.log(
    JSON.stringify(
      {
        user: user.email,
        organization: organization.slug,
        workspace: workspace.slug
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
