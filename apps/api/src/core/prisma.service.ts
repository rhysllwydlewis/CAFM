import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@fmstead/db';

/**
 * The API connects as the application role (APP_DATABASE_URL, e.g. cafm_app),
 * never the owner, so row-level security always applies.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const url = process.env.APP_DATABASE_URL;
    if (!url) throw new Error('APP_DATABASE_URL is not set');
    super({ datasourceUrl: url });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
