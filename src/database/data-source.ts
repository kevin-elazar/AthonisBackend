import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../config/database.config';

/**
 * DataSource usado pela CLI do TypeORM:
 *   npm run migration:generate -- src/database/migrations/NomeDaMudanca
 *   npm run migration:run
 *   npm run migration:revert
 */
export default new DataSource(buildDataSourceOptions());
