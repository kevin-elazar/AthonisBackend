import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Liga cada refresh token trocado ao token que o substituiu. É o que permite
 * aceitar a repetição da troca dentro da tolerância sem abrir uma segunda
 * cadeia de sessões a partir do mesmo token.
 */
export class RefreshTokenSuccessor1795400000000 implements MigrationInterface {
  name = 'RefreshTokenSuccessor1795400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "refresh_token" ADD "replaced_by_id" integer`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "refresh_token" DROP COLUMN "replaced_by_id"`);
  }
}
