import { PartialType } from '@nestjs/mapped-types';
import { CreateClientDto } from './create-client.dto';

/**
 * DTO para atualização de clientes
 * Todos os campos do CreateClientDto são opcionais
 */
export class UpdateClientDto extends PartialType(CreateClientDto) {}
