import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RATE_LIMIT_STORE, type RateLimitStore } from "../rate-limit/rate-limit.store";

@Injectable()
export class AgentRateLimitGuard implements CanActivate {
  private readonly windowMs = 60_000;
  private readonly userLimit: number;
  private readonly organizationLimit: number;

  constructor(
    @Inject(RATE_LIMIT_STORE) private readonly store: RateLimitStore,
    config: ConfigService
  ) {
    this.userLimit = Number(config.get<string>("AGENT_RATE_LIMIT_USER_PER_MINUTE", "10"));
    this.organizationLimit = Number(config.get<string>("AGENT_RATE_LIMIT_ORGANIZATION_PER_MINUTE", "60"));
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ organization?: { id?: string }; user?: { userId?: string } }>();
    if (!request.organization?.id || !request.user?.userId) return true;
    await this.enforce(request.organization.id, request.user.userId);
    return true;
  }

  async enforce(organizationId: string, userId: string): Promise<void> {
    const userResult = await this.store.increment(`agent:user:${organizationId}:${userId}`, this.windowMs);
    if (userResult.count > this.userLimit) {
      throw this.limitExceeded("You have sent too many AI requests", userResult.resetAt);
    }

    const organizationResult = await this.store.increment(`agent:organization:${organizationId}`, this.windowMs);
    if (organizationResult.count > this.organizationLimit) {
      throw this.limitExceeded("This workspace has reached its AI request limit", organizationResult.resetAt);
    }
  }

  private limitExceeded(message: string, resetAt: number) {
    const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
    return new HttpException(
      { statusCode: HttpStatus.TOO_MANY_REQUESTS, message: `${message}. Please try again in ${retryAfterSeconds} seconds.`, retryAfterSeconds },
      HttpStatus.TOO_MANY_REQUESTS
    );
  }
}
