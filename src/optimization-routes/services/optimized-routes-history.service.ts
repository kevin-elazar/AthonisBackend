import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OptimizedRouteHistory } from '../../shared/entities/optimized-route-history.entity';
import { CreateOptimizedRouteHistoryDto } from '../dto/create-optimized-route-history.dto';
import { UpdateOptimizedRouteHistoryDto } from '../dto/update-optimized-route-history.dto';
import { OptimizedRouteHistoryResponseDto } from '../dto/optimized-route-history-response.dto';
import { TenantContextService } from '../../shared/tenant/tenant-context.service';

@Injectable()
export class OptimizedRoutesHistoryService {
  private readonly logger = new Logger(OptimizedRoutesHistoryService.name);

  constructor(
    @InjectRepository(OptimizedRouteHistory)
    private historyRepository: Repository<OptimizedRouteHistory>,
    private tenantContext: TenantContextService,
  ) {}

  /**
   * Cria um novo registro de histórico de rota otimizada
   */
  async create(createDto: CreateOptimizedRouteHistoryDto): Promise<OptimizedRouteHistoryResponseDto> {
    try {
      const idCompany = this.tenantContext.getIdCompany();
      const user = this.tenantContext.getUser();
      const createdBy = user?.email ?? undefined;

      const history = this.historyRepository.create({
        ...createDto,
        id_company: idCompany,
        status: createDto.status || 'success',
        created_by: createdBy,
      });

      const savedHistory = await this.historyRepository.save(history);
      return this.mapToResponseDto(savedHistory);
    } catch (error) {
      this.logger.error('Erro ao criar histórico de rota:', error);
      throw error;
    }
  }

  /**
   * Busca todos os registros de histórico
   */
  async findAll(): Promise<OptimizedRouteHistoryResponseDto[]> {
    try {
      const idCompany = this.tenantContext.getIdCompany();
      const histories = await this.historyRepository.find({
        where: { id_company: idCompany },
        order: { created_at: 'DESC' }
      });

      return histories.map(history => this.mapToResponseDto(history));
    } catch (error) {
      this.logger.error('Erro ao buscar históricos:', error);
      throw error;
    }
  }

  /**
   * Busca um registro específico por ID
   */
  async findOne(id: number): Promise<OptimizedRouteHistoryResponseDto> {
    try {
      const idCompany = this.tenantContext.getIdCompany();
      const history = await this.historyRepository.findOne({
        where: { id, id_company: idCompany }
      });

      if (!history) {
        throw new NotFoundException(`Histórico de rota com ID ${id} não encontrado`);
      }

      return this.mapToResponseDto(history);
    } catch (error) {
      this.logger.error(`Erro ao buscar histórico ${id}:`, error);
      throw error;
    }
  }

  /**
   * Busca históricos por IDs de pedidos
   * Retorna históricos que contêm pelo menos um dos orderIds informados
   */
  async findByOrderIds(orderIds: number[]): Promise<OptimizedRouteHistoryResponseDto[]> {
    try {
      const idCompany = this.tenantContext.getIdCompany();
      const orderIdSet = new Set(orderIds.map(id => Number(id)));

      const histories = await this.historyRepository.find({
        where: { id_company: idCompany },
        order: { created_at: 'DESC' },
      });

      // Filtrar em memória para matching exato de IDs (evita falsos positivos do LIKE)
      const filtered = histories.filter(history => {
        const historyIds = Array.isArray(history.order_ids)
          ? history.order_ids
          : String(history.order_ids).split(',').map(id => Number(id.trim()));
        return historyIds.some(id => orderIdSet.has(id));
      });

      return filtered.map(history => this.mapToResponseDto(history));
    } catch (error) {
      this.logger.error('Erro ao buscar históricos por order IDs:', error);
      throw error;
    }
  }

  /**
   * Busca históricos por período
   */
  async findByDateRange(startDate: Date, endDate: Date): Promise<OptimizedRouteHistoryResponseDto[]> {
    try {
      const idCompany = this.tenantContext.getIdCompany();
      const histories = await this.historyRepository
        .createQueryBuilder('history')
        .where('history.created_at BETWEEN :startDate AND :endDate', {
          startDate,
          endDate
        })
        .andWhere('history.id_company = :idCompany', { idCompany })
        .orderBy('history.created_at', 'DESC')
        .getMany();

      return histories.map(history => this.mapToResponseDto(history));
    } catch (error) {
      this.logger.error('Erro ao buscar históricos por data:', error);
      throw error;
    }
  }

  /**
   * Atualiza um registro de histórico
   */
  async update(id: number, updateDto: UpdateOptimizedRouteHistoryDto): Promise<OptimizedRouteHistoryResponseDto> {
    try {
      const idCompany = this.tenantContext.getIdCompany();
      const history = await this.historyRepository.findOne({
        where: { id, id_company: idCompany }
      });

      if (!history) {
        throw new NotFoundException(`Histórico de rota com ID ${id} não encontrado`);
      }

      const user = this.tenantContext.getUser();
      const updatedBy = user?.email ?? undefined;

      // Atualizar campos
      Object.assign(history, { ...updateDto, updated_by: updatedBy });

      const updatedHistory = await this.historyRepository.save(history);
      return this.mapToResponseDto(updatedHistory);
    } catch (error) {
      this.logger.error(`Erro ao atualizar histórico ${id}:`, error);
      throw error;
    }
  }

  /**
   * Remove um registro de histórico
   */
  async remove(id: number): Promise<void> {
    try {
      const idCompany = this.tenantContext.getIdCompany();
      const history = await this.historyRepository.findOne({
        where: { id, id_company: idCompany }
      });

      if (!history) {
        throw new NotFoundException(`Histórico de rota com ID ${id} não encontrado`);
      }

      await this.historyRepository.remove(history);
      this.logger.log(`Histórico ${id} removido com sucesso`);
    } catch (error) {
      this.logger.error(`Erro ao remover histórico ${id}:`, error);
      throw error;
    }
  }

  /**
   * Mapeia entidade para DTO de resposta
   */
  private mapToResponseDto(history: OptimizedRouteHistory): OptimizedRouteHistoryResponseDto {
    return {
      id: history.id,
      created_at: history.created_at,
      updated_at: history.updated_at,
      order_ids: history.order_ids,
      total_routes: history.total_routes,
      total_orders: history.total_orders,
      optimization_time_ms: history.optimization_time_ms,
      google_api_response: this.parseJsonSafely(history.google_api_response),
      optimization_result: this.parseJsonSafely(history.optimization_result),
      status: history.status,
      notes: history.notes,
      created_by: history.created_by,
    };
  }

  /**
   * Parse JSON com tratamento de erros
   */
  private parseJsonSafely(jsonString: string): any {
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      this.logger.warn('Erro ao fazer parse de JSON:', error);
      return jsonString;
    }
  }
}

