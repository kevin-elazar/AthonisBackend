import { IsIn, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ROUTE_STATUSES, RouteStatus } from '../../../shared/domain/enums';

export class FindRouteDto {
  @ApiProperty({ description: 'Filtra por situação da rota', enum: ROUTE_STATUSES, required: false })
  @IsOptional()
  @IsIn(ROUTE_STATUSES, {
    message: `Status deve ser um de: ${ROUTE_STATUSES.join(', ')}`,
  })
  status?: RouteStatus;

  @ApiProperty({ description: 'Filtra pelo dia planejado (AAAA-MM-DD)', required: false })
  @IsOptional()
  @IsDateString()
  planned_date?: string;
}
