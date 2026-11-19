import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Até a v1.0.1, uma rota gerada sem o Google gravava no pedido a coordenada
 * estimada (centro da cidade, ou São Paulo para cidade desconhecida) junto com
 * a chave do endereço, como se fosse definitiva. Com o Google ligado, esses
 * pedidos continuavam usando a coordenada falsa: o otimizador via uma entrega
 * a centenas de quilômetros e a deixava fora da rota.
 *
 * Aqui os pedidos ainda na fila (pendentes, sem rota) perdem só a chave: na
 * próxima roteirização são localizados de novo, pelo cliente, pelo cache ou
 * pelo geocoding. Pedido já roteirizado ou entregue fica como está.
 */
export class ResetStaleOrderCoordinates1795500000000 implements MigrationInterface {
  name = 'ResetStaleOrderCoordinates1795500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "order" SET "delivery_geocoded_address" = NULL WHERE "route_id" IS NULL AND "status" = 'pending' AND "delivery_geocoded_address" IS NOT NULL`,
    );
  }

  public async down(): Promise<void> {
    // Nada a desfazer: a chave é recalculada na próxima roteirização.
  }
}
