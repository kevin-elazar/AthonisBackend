import { SetMetadata } from '@nestjs/common';

export const ALLOW_DRIVER_KEY = 'allowDriver';

/**
 * Libera o endpoint (ou o controller inteiro) para o papel 'driver'.
 * Sem esta marca, o DriverRestrictionGuard responde 403 ao aplicativo.
 */
export const AllowDriver = () => SetMetadata(ALLOW_DRIVER_KEY, true);
