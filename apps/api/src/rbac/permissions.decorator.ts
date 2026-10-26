import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@idepot/auth';

export const PERMISSIONS_KEY = 'idepot:required-permissions';

export const RequirePermissions = (...perms: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, perms);
