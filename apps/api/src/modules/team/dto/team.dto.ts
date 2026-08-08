import { IsEmail, IsIn, IsString, MinLength } from "class-validator";
import type { MembershipRoleValue } from "../../../common/decorators/roles.decorator";

const assignableRoles: MembershipRoleValue[] = ["ADMIN", "MEMBER", "VIEWER"];

export class CreateInvitationDto {
  @IsEmail()
  email!: string;

  @IsIn(assignableRoles)
  role!: MembershipRoleValue;
}

export class UpdateMembershipRoleDto {
  @IsIn(assignableRoles)
  role!: MembershipRoleValue;
}

export class AcceptInvitationDto {
  @IsString()
  @MinLength(32)
  token!: string;
}
