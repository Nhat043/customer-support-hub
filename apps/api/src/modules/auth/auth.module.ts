import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule } from "@nestjs/config";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module";
import { AuthRateLimitGuard } from "../../common/guards/auth-rate-limit.guard";
import { RateLimitModule } from "../../infrastructure/rate-limit/rate-limit.module";

@Module({
  imports: [ConfigModule, PrismaModule, JwtModule.register({}), RateLimitModule],
  controllers: [AuthController],
  providers: [AuthService, AuthRateLimitGuard]
})
export class AuthModule {}
