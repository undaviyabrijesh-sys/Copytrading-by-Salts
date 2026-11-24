import { Prisma, PrismaClient } from "@prisma/client";
export { Prisma };

const globalForPrisma = globalThis as unknown as { saltsPrisma?: PrismaClient };

export const prisma = globalForPrisma.saltsPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.saltsPrisma = prisma;
