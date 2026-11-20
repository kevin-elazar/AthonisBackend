import { containsInsensitive } from '../../../database/column-types';
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In, FindOptionsWhere } from "typeorm";
import { Client } from "../../../shared/entities/client.entity";
import { CreateClientDto } from "../dto/create-client.dto";
import { UpdateClientDto } from "../dto/update-client.dto";
import { FindClientDto } from "../dto/find-client.dto";
import { TenantContextService } from "../../../shared/tenant/tenant-context.service";
import { AddressCoordinatesService } from "../../../optimization-routes/services/address-coordinates.service";

@Injectable()
export class ClientsService {
  private readonly logger = new Logger(ClientsService.name);

  constructor(
    @InjectRepository(Client)
    private clientRepository: Repository<Client>,
    private tenantContext: TenantContextService,
    private addressCoordinates: AddressCoordinatesService,
  ) {}

  async create(createClientDto: CreateClientDto) {
    const idCompany = this.tenantContext.getIdCompany();
    const user = this.tenantContext.getUser();
    const createdBy = user?.email ?? undefined;

    const client = this.clientRepository.create({
      ...createClientDto,
      id_company: idCompany,
      created_by: createdBy,
    });
    await this.resolveCoordinates(client);
    return await this.clientRepository.save(client);
  }

  /**
   * Resolve as coordenadas do endereço do cliente.
   *
   * O endereço do cliente é o mais reaproveitado da operação: a maioria dos
   * pedidos entrega nele. Resolver aqui, uma vez, evita geocodificar o mesmo
   * lugar a cada roteirização.
   *
   * Falhar aqui não impede salvar o cliente: cadastro é o que importa, e a
   * coordenada é resolvida de novo na primeira roteirização.
   */
  private async resolveCoordinates(client: Client): Promise<void> {
    const parts = {
      street: client.street,
      number: client.number,
      district: client.neighborhood,
      city: client.city,
      state: client.state,
      zipCode: client.zip_code,
    };

    const chave = this.addressCoordinates.keyFor(parts);

    // Endereço inalterado desde a última vez: nada a fazer.
    if (
      this.addressCoordinates.storedIsFresh(
        client.geocoded_address,
        client.latitude,
        client.longitude,
        chave,
      )
    ) {
      return;
    }

    try {
      const resolvido = await this.addressCoordinates.resolve(parts, client.city);

      // Coordenada simulada não é gravada: ela viraria um dado falso no
      // cadastro, e é indistinguível de uma real depois de salva.
      if (!resolvido || resolvido.source === 'simulated') {
        client.latitude = null;
        client.longitude = null;
        client.geocoded_address = null;
        return;
      }

      client.latitude = resolvido.latitude;
      client.longitude = resolvido.longitude;
      client.geocoded_address = resolvido.addressKey;
    } catch (erro) {
      this.logger.warn(
        `Não foi possível resolver as coordenadas do cliente: ${erro instanceof Error ? erro.message : erro}`,
      );
    }
  }

  async findAll(query: FindClientDto) {
    try {
      const {
        page = 1,
        limit = 10,
        name,
        document,
        type,
        status,
        sort_by = "name",
        order = "ASC",
      } = query;

      const where = this.buildSearchConditions({ name, document, type, status });

      where.id_company = this.tenantContext.getIdCompany();

      const allowedFields = ["name", "document", "type", "created_at"];
      if (!allowedFields.includes(sort_by)) {
        throw new BadRequestException(
          `Invalid sort field. Allowed: ${allowedFields.join(", ")}`,
        );
      }

      const [items, total] = await this.clientRepository.findAndCount({
        where,
        order: { [sort_by]: order },
        skip: (page - 1) * limit,
        take: limit,
      });

      const withMetrics = await this.attachOrderMetrics(items);

      return {
        items: withMetrics,
        meta: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException("Error finding clients");
    }
  }

  /**
   * Anexa total de pedidos e data do último pedido de cada cliente com uma
   * única consulta agregada, em vez de uma por linha.
   */
  private async attachOrderMetrics(clients: Client[]) {
    if (clients.length === 0) return clients;

    const idCompany = this.tenantContext.getIdCompany();
    const clientIds = clients.map((client) => client.client_id);

    const rows = await this.clientRepository.manager
      .createQueryBuilder()
      .select("o.client_id", "client_id")
      .addSelect("COUNT(o.order_id)", "order_count")
      .addSelect("MAX(o.created_at)", "last_order_date")
      .from("order", "o")
      .where("o.client_id IN (:...clientIds)", { clientIds })
      .andWhere("o.id_company = :idCompany", { idCompany })
      .groupBy("o.client_id")
      .getRawMany();

    const metrics = new Map<number, { count: number; last: string | null }>();
    for (const row of rows) {
      metrics.set(Number(row.client_id), {
        count: Number(row.order_count) || 0,
        last: row.last_order_date ?? null,
      });
    }

    return clients.map((client) => ({
      ...client,
      order_count: metrics.get(client.client_id)?.count ?? 0,
      last_order_date: metrics.get(client.client_id)?.last ?? null,
    }));
  }

  private buildSearchConditions({
    name,
    document,
    type,
    status,
  }: Partial<FindClientDto>) {
    const where: FindOptionsWhere<Client> = {};

    if (status) {
      where.status = status;
    }

    if (name) {
      where.name = containsInsensitive(name.trim());
    }

    if (document) {
      where.document = document.replace(/[^0-9]/g, "");
    }

    if (type) {
      where.type = type;
    }

    return where;
  }

  async findOne(id: string) {
    const idCompany = this.tenantContext.getIdCompany();
    const client = await this.clientRepository.findOne({
      where: { client_id: Number(id), id_company: idCompany },
    });
    if (!client) {
      throw new NotFoundException(`Client ID ${id} not found`);
    }
    return client;
  }

  async update(id: string, updateClientDto: UpdateClientDto) {
    const client = await this.findOne(id);
    const user = this.tenantContext.getUser();
    const updatedBy = user?.email ?? undefined;

    Object.assign(client, { ...updateClientDto, updated_by: updatedBy });
    await this.resolveCoordinates(client);
    return await this.clientRepository.save(client);
  }

  async remove(id: string) {
    const client = await this.findOne(id);
    return await this.clientRepository.remove(client);
  }
}
