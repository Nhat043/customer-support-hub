import { IsString, MaxLength, MinLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class CreateCommentDto {
  @ApiProperty({ example: "Please review the updated workflow before approval." })
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  body!: string;
}
