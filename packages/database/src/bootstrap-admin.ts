import { timingSafeEqual } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

function requireSecret(name: string): string {
  const value = process.env[name];
  if (!value || value.length < 16) {
    throw new Error(`${name} must be set and contain at least 16 characters.`);
  }
  return value;
}

async function main() {
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const suppliedToken = requireSecret("ADMIN_BOOTSTRAP_TOKEN");
  const expectedToken = requireSecret("ADMIN_BOOTSTRAP_EXPECTED_TOKEN");
  const password = requireSecret("ADMIN_BOOTSTRAP_PASSWORD");

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("ADMIN_BOOTSTRAP_EMAIL must be a valid email address.");
  }
  const supplied = Buffer.from(suppliedToken);
  const expected = Buffer.from(expectedToken);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new Error("Bootstrap authorization failed.");
  }

  const existingAdmin = await prisma.user.findFirst({ where: { roles: { has: "ADMIN" } }, select: { id: true } });
  if (existingAdmin) throw new Error("An admin already exists. Bootstrap is one-time and cannot be rerun.");

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) throw new Error("This email already belongs to an account. Contact an existing admin.");

  const admin = await prisma.user.create({
    data: {
      email,
      displayName: process.env.ADMIN_BOOTSTRAP_DISPLAY_NAME?.trim() || "Platform Owner",
      passwordHash,
      status: "ACTIVE",
      roles: ["ADMIN"]
    },
    select: { id: true, email: true, roles: true, status: true }
  });

  console.info("Initial administrator created:", admin.email);
  console.info("Remove ADMIN_BOOTSTRAP_TOKEN, ADMIN_BOOTSTRAP_EXPECTED_TOKEN and ADMIN_BOOTSTRAP_PASSWORD from the runtime immediately.");
}

main()
  .catch((error: unknown) => {
    console.error("Admin bootstrap failed:", error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
