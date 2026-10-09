import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
} from 'class-validator';
import { OCCURRENCE_TYPES, OccurrenceType } from '../../../shared/domain/enums';

/**
 * O que todo registro vindo do aparelho carrega.
 *
 * `client_event_id` e `occurred_at` são obrigatórios porque o envio pode
 * acontecer horas depois do fato e mais de uma vez: o primeiro evita
 * duplicar, o segundo preserva a hora real.
 */
export class DriverEventDto {
  @ApiProperty({
    description: 'Identificador gerado no aparelho (UUID). Reenviar o mesmo valor não cria outro registro.',
    example: '0b6f2f0e-7c1d-4d0a-9d55-1f2c6f1a9b10',
  })
  @IsString()
  @Length(8, 64)
  client_event_id: string;

  @ApiProperty({
    description: 'Hora do aparelho no momento da ação (ISO 8601)',
    example: '2026-10-08T14:32:10.000Z',
  })
  @IsISO8601({}, { message: 'occurred_at deve ser uma data ISO 8601' })
  occurred_at: string;

  @ApiProperty({ required: false, example: -26.4853 })
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @ApiProperty({ required: false, example: -49.0661 })
  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @ApiProperty({ required: false, description: 'Precisão da posição, em metros', example: 12 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  accuracy_m?: number;
}

export class DeliverStopDto extends DriverEventDto {
  @ApiProperty({ required: false, description: 'Observação do entregador', example: 'Recebido pelo porteiro' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class FailStopDto extends DriverEventDto {
  @ApiProperty({ description: 'Motivo da não entrega', enum: OCCURRENCE_TYPES })
  @IsIn(OCCURRENCE_TYPES, {
    message: `occurrence_type deve ser um de: ${OCCURRENCE_TYPES.join(', ')}`,
  })
  occurrence_type: OccurrenceType;

  @ApiProperty({ required: false, description: 'Detalhe da ocorrência', example: 'Empresa fechada para almoço' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
