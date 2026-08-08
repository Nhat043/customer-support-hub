import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Public } from "../../common/decorators/public.decorator";
import { JwtGuard } from "../../common/guards/jwt.guard";
import { AcceptInvitationDto } from "./dto/team.dto";
import { TeamService } from "./team.service";

@ApiTags("Invitations")
@Controller("invitations")
export class InvitationsController {
  constructor(private readonly teamService: TeamService) {}

  @Public()
  @Get(":token")
  preview(@Param("token") token: string) {
    return this.teamService.previewInvitation(token);
  }

  @UseGuards(JwtGuard)
  @ApiBearerAuth("access-token")
  @Post("accept")
  accept(
    @CurrentUser() user: { userId: string; sessionId: string },
    @Body() dto: AcceptInvitationDto,
  ) {
    return this.teamService.acceptInvitation({
      token: dto.token,
      userId: user.userId,
      email: "",
      sessionId: user.sessionId,
    });
  }
}
