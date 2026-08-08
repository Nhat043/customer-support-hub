import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { RolesGuard } from "../../../../src/common/guards/roles.guard";

function contextWithRole(role?: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ membership: role ? { role } : undefined }),
    }),
    getHandler: () => "handler",
    getClass: () => "class",
  } as any;
}

test("RolesGuard allows a matching membership role", () => {
  const reflector = {
    getAllAndOverride: () => ["OWNER", "ADMIN"],
  } as any;
  const guard = new RolesGuard(reflector);

  assert.equal(guard.canActivate(contextWithRole("ADMIN")), true);
});

test("RolesGuard rejects a membership role outside the policy", () => {
  const reflector = {
    getAllAndOverride: () => ["OWNER", "ADMIN"],
  } as any;
  const guard = new RolesGuard(reflector);

  assert.throws(() => guard.canActivate(contextWithRole("VIEWER")), ForbiddenException);
});

test("RolesGuard leaves routes without a role policy available to members", () => {
  const reflector = { getAllAndOverride: () => undefined } as any;
  const guard = new RolesGuard(reflector);

  assert.equal(guard.canActivate(contextWithRole("VIEWER")), true);
});
