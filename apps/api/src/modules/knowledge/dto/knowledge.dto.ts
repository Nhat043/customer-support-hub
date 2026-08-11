import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class UploadKnowledgeDocumentDto {
  @ApiProperty({ example: "support-playbook.md" })
  @IsString()
  @Matches(/\.md$/i, { message: "fileName must end in .md" })
  @MaxLength(180)
  fileName!: string;

  @ApiPropertyOptional({ example: "Support playbook" })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title?: string;

  @ApiProperty({ description: "UTF-8 Markdown file content" })
  @IsString()
  @MinLength(1)
  @MaxLength(512_000)
  content!: string;
}
