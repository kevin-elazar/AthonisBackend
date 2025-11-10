import { PartialType } from '@nestjs/mapped-types';
import { CreateDriverDto } from './create-driver.dto';

/**
 * DTO para atualização de motoristas
 * Todos os campos do CreateDriverDto são opcionais
 */
export class UpdateDriverDto extends PartialType(CreateDriverDto) {}
