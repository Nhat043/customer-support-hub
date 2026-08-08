import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable
} from "@nestjs/common";
import { RATE_LIMIT_STORE, type RateLimitStore } from "../rate-limit/rate-limit.store";

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  private readonly windowMs = 60_000;
  private readonly maxRequests = 10;

  constructor(@Inject(RATE_LIMIT_STORE) private readonly store: RateLimitStore) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ ip?: string; path?: string }>();
    const key = `auth:${request.ip ?? "unknown"}:${request.path ?? "auth"}`;
    const result = await this.store.increment(key, this.windowMs);
    if (result.count > this.maxRequests) {
      throw new HttpException("Too many authentication attempts", HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
