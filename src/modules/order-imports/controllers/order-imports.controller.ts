import { 
  Controller, 
  Post, 
  Get,
  Param,
  Query,
  UseInterceptors, 
  UploadedFile, 
  BadRequestException,
  Logger,
  StreamableFile,
  Response
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiConsumes, 
  ApiBearerAuth,
  ApiParam,
  ApiBody
} from '@nestjs/swagger';
import { OrderImportsService } from '../services/order-imports.service';
import { ImportResultDto } from '../dto/import-result.dto';
import { RejectedFileListDto } from '../dto/rejected-file-list.dto';
import { FindRejectedFilesDto } from '../dto/find-rejected-files.dto';
import { createReadStream } from 'fs';
import type { Response as ExpressResponse } from 'express';

@ApiTags('Importação de Pedidos')
@Controller('order-imports')
@ApiBearerAuth('JWT-auth')
export class OrderImportsController {
  private readonly logger = new Logger(OrderImportsController.name);

  constructor(private readonly orderImportsService: OrderImportsService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ 
    summary: 'Importar pedidos via CSV',
    description: 'Faz upload de um arquivo CSV contendo pedidos para importação em massa. O arquivo deve conter as colunas obrigatórias e respeitar o formato especificado.' 
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Arquivo CSV com os pedidos a serem importados'
        },
      },
    },
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Importação processada com sucesso',
    type: ImportResultDto,
    schema: {
      example: {
        totalLinhas: 100,
        quantidadeSucessos: 95,
        quantidadeFalhas: 5,
        sucessos: [
          {
            linha: 2,
            order_id: 1001,
            title: 'Entrega de mercadorias'
          }
        ],
        falhas: [
          {
            linha: 5,
            dados: { client_id: 999, title: 'Teste' },
            erros: ['Cliente com ID 999 não existe no sistema']
          }
        ],
        arquivoOriginal: 'pedidos_20241120_153045.csv',
        arquivoRejeicao: 'REJEICAO_pedidos_20241120_153045.csv',
        tempoProcessamento: 2.5,
        status: 'SUCESSO_PARCIAL',
        mensagem: '95 pedidos importados com sucesso de um total de 100 linhas. 5 linhas contêm erros e foram salvas no arquivo de rejeição.'
      }
    }
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Arquivo inválido ou formato incorreto',
    schema: {
      example: {
        statusCode: 400,
        message: 'Apenas arquivos CSV são permitidos',
        error: 'Bad Request'
      }
    }
  })
  @ApiResponse({ 
    status: 413, 
    description: 'Arquivo muito grande (limite: 10MB)',
    schema: {
      example: {
        statusCode: 413,
        message: 'Arquivo excede o tamanho máximo de 10MB',
        error: 'Payload Too Large'
      }
    }
  })
  @ApiResponse({ 
    status: 500, 
    description: 'Erro interno do servidor',
    schema: {
      example: {
        statusCode: 500,
        message: 'Erro ao processar importação de pedidos',
        error: 'Internal Server Error'
      }
    }
  })
  async uploadCSV(@UploadedFile() file: any): Promise<ImportResultDto> {
    try {
      if (!file) {
        throw new BadRequestException('Nenhum arquivo foi enviado');
      }

      // Validar extensão
      if (!file.originalname.toLowerCase().endsWith('.csv')) {
        throw new BadRequestException('Apenas arquivos CSV são permitidos');
      }

      // Validar tamanho (10MB)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        throw new BadRequestException('Arquivo excede o tamanho máximo de 10MB');
      }

      // Validar se não está vazio
      if (file.size === 0) {
        throw new BadRequestException('Arquivo está vazio');
      }

      this.logger.log(`Iniciando importação do arquivo: ${file.originalname} (${file.size} bytes)`);

      const result = await this.orderImportsService.importOrders(file);

      this.logger.log(`Importação concluída: ${result.status}`);
      return result;

    } catch (error) {
      this.logger.error(`Erro no upload do CSV: ${error}`);
      throw error;
    }
  }

  @Get('rejected-files')
  @ApiOperation({ 
    summary: 'Listar arquivos de rejeição',
    description: 'Retorna uma lista de todos os arquivos de rejeição gerados durante as importações, ordenados por data de modificação (mais recentes primeiro). Permite filtrar por intervalo de datas usando os parâmetros dataInicio e dataFim.' 
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de arquivos de rejeição retornada com sucesso',
    type: RejectedFileListDto,
    schema: {
      example: {
        files: [
          {
            filename: 'REJEICAO_teste_rejeicao_20251123_170943.csv',
            size: 2048,
            sizeFormatted: '2 KB',
            createdAt: '2025-11-23T17:09:43.000Z',
            modifiedAt: '2025-11-23T17:09:43.000Z'
          }
        ],
        total: 1
      }
    }
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Parâmetros de data inválidos',
    schema: {
      example: {
        statusCode: 400,
        message: 'Data inicial deve estar no formato YYYY-MM-DD',
        error: 'Bad Request'
      }
    }
  })
  @ApiResponse({ 
    status: 500, 
    description: 'Erro interno do servidor',
    schema: {
      example: {
        statusCode: 500,
        message: 'Erro ao listar arquivos de rejeição',
        error: 'Internal Server Error'
      }
    }
  })
  async listRejectedFiles(@Query() query: FindRejectedFilesDto): Promise<RejectedFileListDto> {
    try {
      this.logger.log(`Solicitação de listagem de arquivos de rejeição${query.dataInicio || query.dataFim ? ` com filtros: dataInicio=${query.dataInicio}, dataFim=${query.dataFim}` : ''}`);
      return await this.orderImportsService.listRejectedFiles(query);
    } catch (error) {
      this.logger.error(`Erro ao listar arquivos de rejeição: ${error}`);
      throw error;
    }
  }

  @Get('download-rejected/:filename')
  @ApiOperation({ 
    summary: 'Baixar arquivo de rejeições',
    description: 'Faz download do arquivo CSV contendo as linhas que falharam durante a importação, incluindo os motivos de cada falha.' 
  })
  @ApiParam({ 
    name: 'filename', 
    description: 'Nome do arquivo de rejeição gerado durante a importação',
    example: 'REJEICAO_pedidos_20241120_153045.csv'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Arquivo de rejeições retornado com sucesso',
    content: {
      'text/csv': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Arquivo de rejeição não encontrado',
    schema: {
      example: {
        statusCode: 404,
        message: 'Arquivo de rejeição não encontrado',
        error: 'Not Found'
      }
    }
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Nome de arquivo inválido',
    schema: {
      example: {
        statusCode: 400,
        message: 'Nome de arquivo inválido',
        error: 'Bad Request'
      }
    }
  })
  async downloadRejected(
    @Param('filename') filename: string,
    @Response({ passthrough: true }) res: ExpressResponse
  ): Promise<StreamableFile> {
    try {
      this.logger.log(`Solicitação de download do arquivo: ${filename}`);

      const filePath = await this.orderImportsService.getRejectedFilePath(filename);

      const file = createReadStream(filePath);

      // Configurar headers para download
      res.set({
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
      });

      this.logger.log(`Arquivo enviado para download: ${filename}`);
      return new StreamableFile(file);

    } catch (error) {
      this.logger.error(`Erro ao baixar arquivo de rejeição: ${error}`);
      throw error;
    }
  }
}

