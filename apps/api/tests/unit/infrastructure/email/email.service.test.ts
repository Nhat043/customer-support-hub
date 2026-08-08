import assert from "node:assert/strict";
import test from "node:test";
import { ConfigService } from "@nestjs/config";
import { EmailService } from "../../../../src/infrastructure/email/email.service";

test("EmailService reports an unsent invitation when Gmail is not configured", async () => {
  const service = new EmailService(new ConfigService({ WEB_BASE_URL: "http://localhost:3000" }));

  const result = await service.sendTeamInvitation({
    recipient: "teammate@example.com",
    organizationName: "Acme Store",
    role: "MEMBER",
    token: "a".repeat(43),
    expiresAt: new Date("2026-08-10T00:00:00.000Z"),
  });

  assert.deepEqual(result, { sent: false, recipient: "teammate@example.com" });
});

test("EmailService sends a six-digit password reset code through Gmail SMTP", async () => {
  const sentMessages: any[] = [];
  const service = new EmailService(
    new ConfigService({
      EMAIL_PROVIDER: "gmail",
      EMAIL_FROM: "Customer Support Hub <nhatnl04@gmail.com>",
    }),
  );
  (service as any).transporter = {
    sendMail: async (message: any) => {
      sentMessages.push(message);
      return { messageId: "smtp-message-2" };
    },
  };

  const result = await service.sendPasswordResetOtp({
    recipient: "owner@example.com",
    code: "123456",
    expiresAt: new Date("2026-08-10T12:34:00.000Z"),
  });

  assert.deepEqual(result, { sent: true, recipient: "owner@example.com" });
  assert.match(sentMessages[0].subject, /password reset code/i);
  assert.match(sentMessages[0].text, /123456/);
  assert.match(sentMessages[0].html, /123456/);
});

test("EmailService sends a secure invitation link through the configured Gmail transport", async () => {
  const sentMessages: any[] = [];
  const service = new EmailService(
    new ConfigService({
      EMAIL_PROVIDER: "gmail",
      EMAIL_FROM: "Customer Support Hub <nhatnl04@gmail.com>",
      WEB_BASE_URL: "http://localhost:3000",
    }),
  );
  (service as any).transporter = {
    sendMail: async (message: any) => {
      sentMessages.push(message);
      return { messageId: "smtp-message-1" };
    },
  };

  const result = await service.sendTeamInvitation({
    recipient: "teammate@example.com",
    organizationName: "Acme & Sons",
    role: "MEMBER",
    token: "a".repeat(43),
    expiresAt: new Date("2026-08-10T00:00:00.000Z"),
  });

  assert.deepEqual(result, { sent: true, recipient: "teammate@example.com" });
  assert.equal(sentMessages[0].to, "teammate@example.com");
  assert.match(sentMessages[0].html, /Acme &amp; Sons/);
  assert.match(sentMessages[0].html, /join\?token=/);
  assert.match(sentMessages[0].text, /Accept your invitation/);
});

test("EmailService keeps the invitation usable when Gmail rejects delivery", async () => {
  const service = new EmailService(
    new ConfigService({
      EMAIL_PROVIDER: "gmail",
      EMAIL_FROM: "Customer Support Hub <nhatnl04@gmail.com>",
      WEB_BASE_URL: "http://localhost:3000",
    }),
  );
  (service as any).transporter = {
    sendMail: async () => {
      throw new Error("Gmail authentication failed");
    },
  };
  (service as any).logger = { error: () => undefined };

  const result = await service.sendTeamInvitation({
    recipient: "teammate@example.com",
    organizationName: "Acme Store",
    role: "VIEWER",
    token: "a".repeat(43),
    expiresAt: new Date("2026-08-10T00:00:00.000Z"),
  });

  assert.deepEqual(result, { sent: false, recipient: "teammate@example.com" });
});
