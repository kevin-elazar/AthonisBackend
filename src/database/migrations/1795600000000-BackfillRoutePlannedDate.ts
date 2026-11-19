import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rotas geradas com pedidos sem data de entrega ficavam sem `planned_date` e
 * sumiam dos indicadores e dos percursos, que filtram por período. Aqui elas
 * recebem o dia da saída (ou, se ainda não saíram, o da criação), no fuso de
 * Brasília, que é o de todas as empresas atuais.
 */
export class BackfillRoutePlannedDate1795600000000 implements MigrationInterface {
  name = 'BackfillRoutePlannedDate1795600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "route" SET "planned_date" = (COALESCE("started_at", "created_at") AT TIME ZONE 'America/Sao_Paulo')::date WHERE "planned_date" IS NULL`,
    );
  }

  public async down(): Promise<void> {
    // Nada a desfazer: a data preenchida continua válida.
  }
}
