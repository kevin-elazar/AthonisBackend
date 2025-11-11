import { PartialType } from '@nestjs/swagger';
import { CreateOptimizedRouteHistoryDto } from './create-optimized-route-history.dto';

export class UpdateOptimizedRouteHistoryDto extends PartialType(CreateOptimizedRouteHistoryDto) {}

