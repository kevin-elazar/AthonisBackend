import { PartialType } from '@nestjs/mapped-types';
import { CreateVehicleDto } from './create-vehicle.dto';

/**
 * DTO para atualização de veículos
 * Todos os campos do CreateVehicleDto são opcionais
 */
export class UpdateVehicleDto extends PartialType(CreateVehicleDto) {}
