import { Global, Module } from "@nestjs/common";
import { TenantAccessService } from "./tenant-access.service";

// Global, like PrismaModule, so every feature module's guards resolve the same
// instance without each one restating the import.
@Global()
@Module({
  providers: [TenantAccessService],
  exports: [TenantAccessService]
})
export class TenantAccessModule {}
