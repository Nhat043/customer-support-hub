import assert from "node:assert/strict";
import test from "node:test";
import * as bcrypt from "bcryptjs";
import { BadRequestException } from "@nestjs/common";
import { AuthService } from "../../../src/modules/auth/auth.service";

function createPasswordResetHarness() {
  const user = {
    id: "user-1",
    email: "owner@example.com",
    status: "ACTIVE",
    passwordHash: "old-password-hash",
  };
  const resets: any[] = [];
  const sentOtps: any[] = [];
  const calls = { userUpdates: [] as any[], sessionUpdates: [] as any[], refreshUpdates: [] as any[] };

  const prisma: any = {
    user: {
      findUnique: async ({ where }: any) => (where.email === user.email ? user : null),
      update: async ({ data }: any) => {
        calls.userUpdates.push(data);
        user.passwordHash = data.passwordHash;
        return user;
      },
    },
    passwordResetOtp: {
      create: async ({ data }: any) => {
        const reset = { id: `reset-${resets.length + 1}`, attempts: 0, verifiedAt: null, consumedAt: null, createdAt: new Date(), ...data };
        resets.push(reset);
        return reset;
      },
      findFirst: async ({ where }: any) => resets
        .filter((reset) => reset.userId === user.id && !reset.consumedAt && !reset.verifiedAt && reset.expiresAt > where.expiresAt.gt)
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ?? null,
      findUnique: async ({ where }: any) => resets.find((reset) => reset.resetTokenHash === where.resetTokenHash) ?? null,
      update: async ({ where, data }: any) => {
        const reset = resets.find((item) => item.id === where.id);
        Object.assign(reset, data);
        return reset;
      },
      updateMany: async ({ where, data }: any) => {
        const matched = resets.filter((reset) => {
          if (where.id && reset.id !== where.id) return false;
          if (where.userId && reset.userId !== where.userId) return false;
          if (where.consumedAt === null && reset.consumedAt !== null) return false;
          if (where.verifiedAt === null && reset.verifiedAt !== null) return false;
          if (where.expiresAt?.gt && reset.expiresAt <= where.expiresAt.gt) return false;
          return true;
        });
        matched.forEach((reset) => Object.assign(reset, data));
        return { count: matched.length };
      },
    },
    session: {
      findMany: async () => [{ id: "session-1" }, { id: "session-2" }],
      updateMany: async (args: any) => {
        calls.sessionUpdates.push(args);
        return { count: 2 };
      },
    },
    refreshToken: {
      updateMany: async (args: any) => {
        calls.refreshUpdates.push(args);
        return { count: 2 };
      },
    },
    $transaction: async (callback: any) => callback(prisma),
  };
  const config = {
    get: (key: string) => key === "PASSWORD_RESET_TOKEN_PEPPER" ? "password-reset-pepper-for-tests" : undefined,
    getOrThrow: () => "fallback-secret",
  };
  const email = {
    sendPasswordResetOtp: async (input: any) => {
      sentOtps.push(input);
      return { sent: true, recipient: input.recipient };
    },
  };

  return {
    service: new AuthService(prisma, { signAsync: async () => "access" } as any, config as any, email as any),
    user,
    resets,
    sentOtps,
    calls,
  };
}

test("password reset stores only hashes and hashes the replacement password", async () => {
  const { service, user, resets, sentOtps, calls } = createPasswordResetHarness();

  await service.requestPasswordReset({ email: " OWNER@EXAMPLE.COM " });

  assert.equal(sentOtps.length, 1);
  assert.match(sentOtps[0].code, /^\d{6}$/);
  assert.notEqual(resets[0].otpHash, sentOtps[0].code);
  assert.equal(resets[0].consumedAt, null);

  const verified = await service.verifyPasswordResetOtp({
    email: "owner@example.com",
    otp: sentOtps[0].code,
  });
  assert.equal(verified.resetToken.length > 32, true);
  assert.notEqual(resets[0].resetTokenHash, verified.resetToken);

  await service.confirmPasswordReset({ resetToken: verified.resetToken, password: "NewPassword123!" });

  assert.notEqual(user.passwordHash, "NewPassword123!");
  assert.equal(await bcrypt.compare("NewPassword123!", user.passwordHash), true);
  assert.ok(resets[0].consumedAt);
  assert.equal(calls.sessionUpdates[0].data.status, "REVOKED");
  assert.equal(calls.refreshUpdates[0].data.status, "REVOKED");
});

test("password reset rejects invalid codes and locks the OTP after five attempts", async () => {
  const { service, resets, sentOtps } = createPasswordResetHarness();
  await service.requestPasswordReset({ email: "owner@example.com" });
  const invalidOtp = sentOtps[0].code === "000000" ? "999999" : "000000";

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await assert.rejects(
      () => service.verifyPasswordResetOtp({ email: "owner@example.com", otp: invalidOtp }),
      (error: BadRequestException) => error.getStatus() === 400,
    );
  }

  assert.equal(resets[0].attempts, 5);
  assert.ok(resets[0].consumedAt);
});

test("password reset request does not reveal unknown accounts", async () => {
  const { service, sentOtps, resets } = createPasswordResetHarness();

  const result = await service.requestPasswordReset({ email: "unknown@example.com" });

  assert.deepEqual(result, { ok: true });
  assert.equal(sentOtps.length, 0);
  assert.equal(resets.length, 0);
});
