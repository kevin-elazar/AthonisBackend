import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

export const databaseConfig: TypeOrmModuleOptions = {
  type: (process.env.DB_TYPE as any) || 'sqlite',
  database: process.env.DB_NAME || './src/database/database.sqlite',
  entities: [ __dirname + '/../**/*.entity{.ts,.js}' ],
  synchronize: process.env.NODE_ENV !== 'production',
  logging: process.env.NODE_ENV === 'development'
};