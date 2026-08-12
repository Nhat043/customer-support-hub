import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_SEPARATOR = ".";

export function createCsrfToken(secret: string, sessionId: string) {
  const nonce = randomBytes(24).toString("base64url");
  return `${nonce}${TOKEN_SEPARATOR}${sign(secret, sessionId, nonce)}`;
}

export function verifyCsrfToken(secret: string, sessionId: string, token: string) {
  const [nonce, signature, ...rest] = token.split(TOKEN_SEPARATOR);
  if (!nonce || !signature || rest.length > 0) return false;
  const expected = sign(secret, sessionId, nonce);
  const actualBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function sign(secret: string, sessionId: string, nonce: string) {
  return createHmac("sha256", secret).update(`${sessionId}:${nonce}`).digest("base64url");
}
