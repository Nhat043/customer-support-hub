import { IsEmail, IsOptional, IsString, Matches, MinLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class RegisterDto {
  @ApiProperty({ example: "owner@example.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: "Password123!", minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: "Nguyen Van A" })
  @IsString()
  @MinLength(2)
  fullName!: string;

  @ApiPropertyOptional({ example: "Acme Workspace" })
  @IsOptional()
  @IsString()
  organizationName?: string;

  @ApiPropertyOptional({ description: "Invitation token from a team invitation link" })
  @IsOptional()
  @IsString()
  @MinLength(32)
  invitationToken?: string;
}

export class LoginDto {
  @ApiProperty({ example: "owner@example.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: "Password123!", minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;
}

export class RequestPasswordResetDto {
  @ApiProperty({ example: "owner@example.com" })
  @IsEmail()
  email!: string;
}

export class VerifyPasswordResetOtpDto {
  @ApiProperty({ example: "owner@example.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: "123456", minLength: 6, maxLength: 6 })
  @IsString()
  @Matches(/^\d{6}$/)
  otp!: string;
}

export class ConfirmPasswordResetDto {
  @ApiProperty({ description: "Short-lived token returned after a valid OTP" })
  @IsString()
  @MinLength(32)
  resetToken!: string;

  @ApiProperty({ example: "Password123!", minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;
}
