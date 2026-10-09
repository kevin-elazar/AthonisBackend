import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';

/** Tamanho máximo de um lote. O aplicativo fatia o rastro acumulado em blocos deste tamanho. */
export const MAX_POINTS_PER_BATCH = 200;

export class LocationPointDto {
  @ApiProperty({ description: 'Identificador do ponto gerado no aparelho (UUID)' })
  @IsString()
  @Length(8, 64)
  client_ping_id: string;

  @ApiProperty({ description: 'Hora da leitura no aparelho (ISO 8601)' })
  @IsISO8601()
  recorded_at: string;

  @ApiProperty({ example: -26.4853 })
  @IsLatitude()
  latitude: number;

  @ApiProperty({ example: -49.0661 })
  @IsLongitude()
  longitude: number;

  @ApiProperty({ required: false, description: 'Precisão, em metros' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  accuracy_m?: number;

  @ApiProperty({ required: false, description: 'Velocidade, em metros por segundo' })
  @IsOptional()
  @IsNumber()
  speed_mps?: number;
}

export class LocationBatchDto {
  @ApiProperty({ type: [LocationPointDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_POINTS_PER_BATCH, {
    message: `Envie no máximo ${MAX_POINTS_PER_BATCH} pontos por chamada`,
  })
  @ValidateNested({ each: true })
  @Type(() => LocationPointDto)
  points: LocationPointDto[];
}
