import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { CsrfGuard } from "../../../../src/common/guards/csrf.guard";
import { createCsrfToken } from "../../../../src/common/security/csrf";

const secret = "c".repeat(32);
const sessionId = "session-123";

function context(input: { cookieToken?: string; headerToken?: string; session?: string } = {}) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        cookies: { sessionId: input.session ?? sessionId, csrfToken: input.cookieToken },
        header: (name: string) => name === "x-csrf-token" ? input.headerToken : undefined
      })
    })
  } as any;
}

test("csrf guard accepts a signed double-submit token for the same session", () => {
  const token = createCsrfToken(secret, sessionId);
  const guard = new CsrfGuard({ get: () => secret } as any);
  assert.equal(guard.canActivate(context({ cookieToken: token, headerToken: token })), true);
});

test("csrf guard rejects missing, mismatched, and forged tokens", () => {
  const token = createCsrfToken(secret, sessionId);
  const guard = new CsrfGuard({ get: () => secret } as any);
  assert.throws(() => guard.canActivate(context()), ForbiddenException);
  assert.throws(() => guard.canActivate(context({ cookieToken: token, headerToken: "other" })), ForbiddenException);
  assert.throws(() => guard.canActivate(context({ cookieToken: "nonce.invalid", headerToken: "nonce.invalid" })), ForbiddenException);
  assert.throws(() => guard.canActivate(context({ cookieToken: token, headerToken: token, session: "other-session" })), ForbiddenException);
});
