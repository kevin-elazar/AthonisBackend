import { ApiProperty } from '@nestjs/swagger';

export class OrderSuccessDto {
  @ApiProperty({ description: 'Número da linha no CSV', example: 2 })
  linha: number;

  @ApiProperty({ description: 'ID do pedido criado', example: 123 })
  order_id: number;

  @ApiProperty({ description: 'Título do pedido', example: 'Entrega de mercadorias' })
  title: string;
}

export class OrderFailureDto {
  @ApiProperty({ description: 'Número da linha no CSV', example: 3 })
  linha: number;

  @ApiProperty({ description: 'Dados da linha que falhou', example: { client_id: 999, title: 'Teste' } })
  dados: any;

  @ApiProperty({ 
    description: 'Motivos da falha', 
    example: ['Cliente com ID 999 não existe', 'Campo urgency é obrigatório'],
    type: [String]
  })
  erros: string[];
}

export class ImportResultDto {
  @ApiProperty({ description: 'Total de linhas processadas (excluindo cabeçalho)', example: 100 })
  totalLinhas: number;

  @ApiProperty({ description: 'Quantidade de pedidos criados com sucesso', example: 95 })
  quantidadeSucessos: number;

  @ApiProperty({ description: 'Quantidade de linhas com erro', example: 5 })
  quantidadeFalhas: number;

  @ApiProperty({ description: 'Detalhes dos pedidos criados com sucesso', type: [OrderSuccessDto] })
  sucessos: OrderSuccessDto[];

  @ApiProperty({ description: 'Detalhes das linhas que falharam', type: [OrderFailureDto] })
  falhas: OrderFailureDto[];

  @ApiProperty({ description: 'Nome do arquivo CSV original salvo', example: 'pedidos_20241120_153045.csv' })
  arquivoOriginal: string;

  @ApiProperty({ 
    description: 'Nome do arquivo CSV com rejeições (se houver)', 
    example: 'REJEICAO_pedidos_20241120_153045.csv', 
    required: false 
  })
  arquivoRejeicao?: string;

  @ApiProperty({ description: 'Tempo de processamento em segundos', example: 2.5 })
  tempoProcessamento: number;

  @ApiProperty({ 
    description: 'Status geral da importação', 
    example: 'SUCESSO_PARCIAL', 
    enum: ['SUCESSO_TOTAL', 'SUCESSO_PARCIAL', 'FALHA_TOTAL'] 
  })
  status: 'SUCESSO_TOTAL' | 'SUCESSO_PARCIAL' | 'FALHA_TOTAL';

  @ApiProperty({ 
    description: 'Mensagem descritiva do resultado', 
    example: '95 pedidos importados com sucesso, 5 linhas com erro' 
  })
  mensagem: string;
}

