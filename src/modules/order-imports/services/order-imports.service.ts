import { 
  Injectable, 
  BadRequestException, 
  NotFoundException, 
  InternalServerErrorException,
  Logger 
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { promises as fs } from 'fs';
import * as path from 'path';
import csvParser from 'csv-parser';
import { createReadStream } from 'fs';
import { createObjectCsvWriter } from 'csv-writer';
import { format } from 'date-fns';
import { plainToClass } from 'class-transformer';
import { validate } from 'class-validator';

import { Client } from '../../../shared/entities/client.entity';
import { Vehicle } from '../../../shared/entities/vehicle.entity';
import { Driver } from '../../../shared/entities/driver.entity';
import { OrdersService } from '../../orders/services/orders.service';
import { CreateOrderDto } from '../../orders/dto/create-order.dto';
import { ImportResultDto, OrderSuccessDto, OrderFailureDto } from '../dto/import-result.dto';

@Injectable()
export class OrderImportsService {
  private readonly logger = new Logger(OrderImportsService.name);
  private readonly uploadsDir = 'importacoes';
  private readonly rejectedDir = 'importacoes/rejeicao';

  constructor(
    @InjectRepository(Client)
    private clientRepository: Repository<Client>,
    @InjectRepository(Vehicle)
    private vehicleRepository: Repository<Vehicle>,
    @InjectRepository(Driver)
    private driverRepository: Repository<Driver>,
    private ordersService: OrdersService,
  ) {}

  /**
   * Salva o arquivo CSV enviado na pasta de importações
   */
  async saveUploadedFile(file: any, originalName: string): Promise<string> {
    try {
      // Criar pasta se não existir
      await fs.mkdir(this.uploadsDir, { recursive: true });

      // Gerar nome único com timestamp
      const timestamp = format(new Date(), 'yyyyMMdd_HHmmss');
      const fileName = `${originalName.replace('.csv', '')}_${timestamp}.csv`;
      const filePath = path.join(this.uploadsDir, fileName);

      // Salvar arquivo
      await fs.writeFile(filePath, file.buffer);
      
      this.logger.log(`Arquivo salvo com sucesso: ${filePath}`);
      return filePath;
    } catch (error) {
      this.logger.error(`Erro ao salvar arquivo: ${error}`);
      throw new InternalServerErrorException('Erro ao salvar arquivo no servidor');
    }
  }

  /**
   * Valida se o arquivo CSV possui formato e cabeçalho corretos
   */
  async validateFileFormat(filePath: string): Promise<boolean> {
    try {
      const requiredColumns = [
        'client_id',
        'title',
        'urgency',
        'quantity',
        'delivery_street',
        'delivery_district',
        'delivery_city',
        'delivery_state',
        'delivery_zipcode',
        'delivery_number'
      ];

      return new Promise((resolve, reject) => {
        let headerChecked = false;

        createReadStream(filePath)
          .pipe(csvParser())
          .on('headers', (headers: string[]) => {
            headerChecked = true;
            const missingColumns = requiredColumns.filter(col => !headers.includes(col));
            
            if (missingColumns.length > 0) {
              reject(new BadRequestException(
                `Colunas obrigatórias faltando no CSV: ${missingColumns.join(', ')}`
              ));
            } else {
              resolve(true);
            }
          })
          .on('error', (error) => {
            reject(new BadRequestException(`Erro ao ler CSV: ${error.message}`));
          })
          .on('end', () => {
            if (!headerChecked) {
              reject(new BadRequestException('Arquivo CSV vazio ou sem cabeçalho'));
            }
          });
      });
    } catch (error) {
      this.logger.error(`Erro na validação do formato: ${error}`);
      throw error;
    }
  }

  /**
   * Valida se as referências (FKs) existem no banco de dados
   */
  async validateReferences(orderData: any): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      // Validar client_id (obrigatório)
      if (orderData.client_id) {
        const client = await this.clientRepository.findOne({
          where: { client_id: orderData.client_id }
        });
        if (!client) {
          errors.push(`Cliente com ID ${orderData.client_id} não existe no sistema`);
        }
      }

      // Validar vehicle_id (opcional)
      if (orderData.vehicle_id) {
        const vehicle = await this.vehicleRepository.findOne({
          where: { vehicle_id: orderData.vehicle_id }
        });
        if (!vehicle) {
          errors.push(`Veículo com ID ${orderData.vehicle_id} não existe no sistema`);
        }
      }

      // Validar driver_id (opcional)
      if (orderData.driver_id) {
        const driver = await this.driverRepository.findOne({
          where: { driver_id: orderData.driver_id }
        });
        if (!driver) {
          errors.push(`Motorista com ID ${orderData.driver_id} não existe no sistema`);
        }
      }

      return {
        isValid: errors.length === 0,
        errors
      };
    } catch (error) {
      this.logger.error(`Erro ao validar referências: ${error}`);
      return {
        isValid: false,
        errors: ['Erro ao validar referências no banco de dados']
      };
    }
  }

  /**
   * Processa o CSV e separa linhas válidas e inválidas
   */
  async processCSV(filePath: string): Promise<{ valid: any[]; invalid: any[] }> {
    const valid: any[] = [];
    const invalid: any[] = [];
    let lineNumber = 1; // Linha 1 é o cabeçalho

    return new Promise((resolve, reject) => {
      const stream = createReadStream(filePath)
        .pipe(csvParser())
        .on('data', async (row) => {
          // Pausar o stream para aguardar operações assíncronas
          stream.pause();
          
          lineNumber++;
          
          try {
            // Converter e normalizar dados
            const orderData: any = {
              client_id: row.client_id ? Number(row.client_id) : undefined,
              title: row.title?.trim() || undefined,
              description: row.description?.trim() || undefined,
              invoice_number: row.invoice_number?.trim() || undefined,
              urgency: row.urgency?.trim() || undefined,
              vehicle_id: row.vehicle_id ? Number(row.vehicle_id) : undefined,
              driver_id: row.driver_id ? Number(row.driver_id) : undefined,
              quantity: row.quantity ? Number(row.quantity) : undefined,
              delivery_street: row.delivery_street?.trim() || undefined,
              delivery_district: row.delivery_district?.trim() || undefined,
              delivery_city: row.delivery_city?.trim() || undefined,
              delivery_state: row.delivery_state?.trim() || undefined,
              delivery_zipcode: row.delivery_zipcode?.trim() || undefined,
              delivery_number: row.delivery_number?.trim() || undefined,
              delivery_complement: row.delivery_complement?.trim() || undefined,
            };

            // Remover campos undefined ou vazios para campos opcionais
            Object.keys(orderData).forEach(key => {
              if (orderData[key] === undefined || orderData[key] === '' || 
                  (typeof orderData[key] === 'number' && isNaN(orderData[key]))) {
                if (['description', 'invoice_number', 'vehicle_id', 'driver_id', 'delivery_complement'].includes(key)) {
                  delete orderData[key];
                }
              }
            });

            // Validar com class-validator
            const dto = plainToClass(CreateOrderDto, orderData);
            const validationErrors = await validate(dto);

            const errors: string[] = [];

            if (validationErrors.length > 0) {
              validationErrors.forEach(error => {
                if (error.constraints) {
                  Object.values(error.constraints).forEach(msg => {
                    errors.push(msg as string);
                  });
                }
              });
            }

            // Validar referências (FKs)
            const refValidation = await this.validateReferences(orderData);
            if (!refValidation.isValid) {
              errors.push(...refValidation.errors);
            }

            if (errors.length > 0) {
              invalid.push({
                linha: lineNumber,
                dados: orderData,
                erros: errors
              });
            } else {
              valid.push({
                linha: lineNumber,
                dados: dto
              });
            }
          } catch (error) {
            this.logger.warn(`Erro ao processar linha ${lineNumber}: ${error}`);
            invalid.push({
              linha: lineNumber,
              dados: row,
              erros: ['Erro ao processar dados da linha']
            });
          }
          
          // Retomar o stream após processar a linha
          stream.resume();
        })
        .on('end', () => {
          this.logger.log(`Processamento CSV concluído. Válidos: ${valid.length}, Inválidos: ${invalid.length}`);
          resolve({ valid, invalid });
        })
        .on('error', (error) => {
          this.logger.error(`Erro ao ler CSV: ${error}`);
          reject(new InternalServerErrorException('Erro ao processar arquivo CSV'));
        });
    });
  }

  /**
   * Salva linhas rejeitadas em um arquivo CSV separado
   */
  async saveRejectedRows(rejectedRows: any[], originalFileName: string): Promise<string | null> {
    if (rejectedRows.length === 0) {
      return null;
    }

    try {
      // Criar pasta de rejeições se não existir
      await fs.mkdir(this.rejectedDir, { recursive: true });

      // Gerar nome do arquivo de rejeição
      const timestamp = format(new Date(), 'yyyyMMdd_HHmmss');
      const fileName = `REJEICAO_${path.basename(originalFileName, '.csv')}_${timestamp}.csv`;
      const filePath = path.join(this.rejectedDir, fileName);

      // Preparar dados para escrita
      const records = rejectedRows.map(row => ({
        linha: row.linha,
        ...row.dados,
        motivo_rejeicao: row.erros.join(' | ')
      }));

      // Obter cabeçalhos dinamicamente
      const headers = Array.from(
        new Set(
          records.flatMap(record => Object.keys(record))
        )
      ).map(key => ({ id: key, title: key }));

      // Criar e escrever CSV
      const csvWriter = createObjectCsvWriter({
        path: filePath,
        header: headers
      });

      await csvWriter.writeRecords(records);

      this.logger.log(`Arquivo de rejeições salvo: ${fileName} (${rejectedRows.length} linhas)`);
      return fileName;
    } catch (error) {
      this.logger.error(`Erro ao salvar arquivo de rejeições: ${error}`);
      throw new InternalServerErrorException('Erro ao salvar arquivo de rejeições');
    }
  }

  /**
   * Salva pedidos válidos no banco de dados (sem transação para permitir sucesso parcial)
   */
  async saveValidOrdersWithTransaction(validOrders: any[]): Promise<{ successes: any[]; failures: any[] }> {
    const successes: any[] = [];
    const failures: any[] = [];

    for (const item of validOrders) {
      try {
        const order = await this.ordersService.create(item.dados);
        successes.push({
          linha: item.linha,
          order_id: order.order_id,
          title: order.title
        });
        this.logger.log(`Pedido criado com sucesso - Linha ${item.linha}, ID: ${order.order_id}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
        failures.push({
          linha: item.linha,
          dados: item.dados,
          erros: [errorMessage]
        });
        this.logger.warn(`Falha ao criar pedido - Linha ${item.linha}: ${errorMessage}`);
      }
    }

    return { successes, failures };
  }

  /**
   * Método principal de importação
   */
  async importOrders(file: any): Promise<ImportResultDto> {
    const startTime = Date.now();

    try {
      // 1. Validar se é arquivo CSV
      if (!file.originalname.toLowerCase().endsWith('.csv')) {
        throw new BadRequestException('Apenas arquivos CSV são permitidos');
      }

      if (!file.mimetype.includes('csv') && !file.mimetype.includes('text')) {
        throw new BadRequestException('Tipo de arquivo inválido. Use apenas arquivos CSV');
      }

      this.logger.log(`Iniciando importação do arquivo: ${file.originalname}`);

      // 2. Salvar arquivo original
      const filePath = await this.saveUploadedFile(file, file.originalname);

      // 3. Validar formato do CSV
      await this.validateFileFormat(filePath);

      // 4. Processar CSV (validação + separação)
      const { valid, invalid } = await this.processCSV(filePath);

      // 5. Salvar pedidos válidos
      const { successes, failures } = await this.saveValidOrdersWithTransaction(valid);

      // 6. Combinar falhas de validação e de salvamento
      const allFailures = [...invalid, ...failures];

      // 7. Salvar arquivo de rejeições (se houver)
      const rejectedFileName = await this.saveRejectedRows(allFailures, file.originalname);

      // 8. Calcular estatísticas
      const totalLinhas = valid.length + invalid.length;
      const endTime = Date.now();
      const tempoProcessamento = (endTime - startTime) / 1000;

      // 9. Determinar status
      let status: 'SUCESSO_TOTAL' | 'SUCESSO_PARCIAL' | 'FALHA_TOTAL';
      let mensagem: string;

      if (successes.length === totalLinhas && totalLinhas > 0) {
        status = 'SUCESSO_TOTAL';
        mensagem = `Todos os ${successes.length} pedidos foram importados com sucesso!`;
      } else if (successes.length > 0) {
        status = 'SUCESSO_PARCIAL';
        mensagem = `${successes.length} pedidos importados com sucesso de um total de ${totalLinhas} linhas. ${allFailures.length} linhas contêm erros e foram salvas no arquivo de rejeição.`;
      } else {
        status = 'FALHA_TOTAL';
        mensagem = `Nenhum pedido foi importado. Todas as ${totalLinhas} linhas contêm erros. Verifique o arquivo de rejeição.`;
      }

      this.logger.log(`Importação concluída: ${mensagem}`);

      // 10. Retornar resultado
      return {
        totalLinhas,
        quantidadeSucessos: successes.length,
        quantidadeFalhas: allFailures.length,
        sucessos: successes,
        falhas: allFailures,
        arquivoOriginal: path.basename(filePath),
        arquivoRejeicao: rejectedFileName || undefined,
        tempoProcessamento,
        status,
        mensagem
      };
    } catch (error) {
      this.logger.error(`Erro na importação: ${error}`);
      
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }

      throw new InternalServerErrorException('Erro ao processar importação de pedidos');
    }
  }

  /**
   * Obtém o caminho completo do arquivo de rejeição para download
   */
  async getRejectedFilePath(filename: string): Promise<string> {
    try {
      // Validar filename contra path traversal
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        throw new BadRequestException('Nome de arquivo inválido');
      }

      const filePath = path.join(this.rejectedDir, filename);

      // Verificar se arquivo existe
      try {
        await fs.access(filePath);
      } catch {
        throw new NotFoundException('Arquivo de rejeição não encontrado');
      }

      return filePath;
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Erro ao buscar arquivo de rejeição');
    }
  }
}

