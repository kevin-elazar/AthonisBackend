import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Paradas por rota (tentativas de entrega).
 *
 * Cria `route_stop` e a preenche com o que existe hoje:
 * - cada pedido que aponta para uma rota vira a parada dessa rota, com a
 *   situação atual do pedido;
 * - cada parada devolvida por cancelamento (`route_returned_stop`) vira uma
 *   parada "returned" da rota cancelada.
 *
 * O número da tentativa segue a ordem das rotas do pedido, sem contar as
 * devolvidas (que não chegaram a ser visitadas).
 */
export class RouteStopAttempts1795700000000 implements MigrationInterface {
  name = 'RouteStopAttempts1795700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "route_stop" (
        "id" SERIAL NOT NULL,
        "id_company" integer NOT NULL,
        "route_id" integer NOT NULL,
        "order_id" integer NOT NULL,
        "attempt" integer NOT NULL DEFAULT 1,
        "stop_sequence" integer,
        "status" character varying(20) NOT NULL DEFAULT 'planned',
        "completed_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_route_stop_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_route_stop_route_order" ON "route_stop" ("route_id", "order_id")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_route_stop_order" ON "route_stop" ("order_id")`);

    // Paradas devolvidas por cancelamento (o pedido já saiu da rota).
    await queryRunner.query(`
      INSERT INTO "route_stop" ("id_company", "route_id", "order_id", "attempt", "stop_sequence", "status", "created_at")
      SELECT DISTINCT ON (rs."route_id", rs."order_id")
             rs."id_company", rs."route_id", rs."order_id", 1, rs."stop_sequence", 'returned', rs."created_at"
        FROM "route_returned_stop" rs
       ORDER BY rs."route_id", rs."order_id", rs."id"
    `);

    // A rota atual de cada pedido.
    await queryRunner.query(`
      INSERT INTO "route_stop" ("id_company", "route_id", "order_id", "attempt", "stop_sequence", "status", "completed_at")
      SELECT o."id_company", o."route_id", o."order_id", 1, o."stop_sequence",
             CASE
               WHEN o."status" IN ('delivered', 'failed', 'in_route') THEN o."status"
               ELSE 'planned'
             END,
             CASE WHEN o."status" = 'delivered' THEN o."delivered_at" END
        FROM "order" o
       WHERE o."route_id" IS NOT NULL
      ON CONFLICT ("route_id", "order_id") DO NOTHING
    `);

    // Numera as tentativas de cada pedido, na ordem das rotas.
    await queryRunner.query(`
      UPDATE "route_stop" s
         SET "attempt" = n."numero"
        FROM (
          SELECT "id", ROW_NUMBER() OVER (PARTITION BY "order_id" ORDER BY "route_id") AS "numero"
            FROM "route_stop"
           WHERE "status" <> 'returned'
        ) n
       WHERE s."id" = n."id"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "route_stop"`);
  }
}
