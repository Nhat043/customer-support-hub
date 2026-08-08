import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  MEMBERSHIP_ROLES_KEY,
  type MembershipRoleValue,
} from "../decorators/roles.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowedRoles = this.reflector.getAllAndOverride<MembershipRoleValue[]>(
      MEMBERSHIP_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!allowedRoles || allowedRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const role = request.membership?.role as MembershipRoleValue | undefined;
    if (!role || !allowedRoles.includes(role)) {
      throw new ForbiddenException("Your workspace role cannot perform this action");
    }

    return true;
  }
}
