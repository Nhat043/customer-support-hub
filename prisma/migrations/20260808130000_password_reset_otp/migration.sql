CREATE TABLE "PasswordResetOtp" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "otpHash" TEXT NOT NULL,
    "resetTokenHash" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetOtp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PasswordResetOtp_resetTokenHash_key" ON "PasswordResetOtp"("resetTokenHash");
CREATE INDEX "PasswordResetOtp_userId_createdAt_idx" ON "PasswordResetOtp"("userId", "createdAt");
CREATE INDEX "PasswordResetOtp_expiresAt_idx" ON "PasswordResetOtp"("expiresAt");

ALTER TABLE "PasswordResetOtp"
ADD CONSTRAINT "PasswordResetOtp_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
