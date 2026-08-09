import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateWorkflowItemDto {
  @ApiProperty({ example: "Review onboarding flow" })
  @IsString()
  @MinLength(2)
  title!: string;

  @ApiPropertyOptional({ example: "Validate acceptance criteria before release." })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @ApiPropertyOptional({ example: "general" })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ enum: ["LOW", "MEDIUM", "HIGH", "URGENT"], example: "MEDIUM" })
  @IsOptional()
  @IsIn(["LOW", "MEDIUM", "HIGH", "URGENT"])
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
}

export class UpdateWorkflowItemDto {
  @ApiPropertyOptional({ example: "Review onboarding flow" })
  @IsOptional()
  @IsString()
  @MinLength(2)
  title?: string;

  @ApiPropertyOptional({ example: "Updated context" })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @ApiPropertyOptional({ enum: ["NEW", "TRIAGE", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"] })
  @IsOptional()
  @IsIn(["NEW", "TRIAGE", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"])
  status?: "NEW" | "TRIAGE" | "IN_PROGRESS" | "WAITING" | "RESOLVED" | "CLOSED";

  @ApiPropertyOptional({ enum: ["LOW", "MEDIUM", "HIGH", "URGENT"] })
  @IsOptional()
  @IsIn(["LOW", "MEDIUM", "HIGH", "URGENT"])
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";

  @ApiPropertyOptional({ description: "Active Owner, Admin, or Member assigned to handle this request" })
  @IsOptional()
  @IsUUID()
  ownerId?: string | null;

  @ApiPropertyOptional({ example: "2026-08-12T09:00:00.000Z", nullable: true })
  @IsOptional()
  @IsDateString()
  dueAt?: string | null;
}
