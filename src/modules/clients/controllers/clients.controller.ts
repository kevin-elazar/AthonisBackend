import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { ClientsService } from "../services/clients.service";
import { CreateClientDto } from "../dto/create-client.dto";
import { UpdateClientDto } from "../dto/update-client.dto";
import { FindClientDto } from "../dto/find-client.dto";
@ApiTags("Clientes")
@Controller("clients")
@ApiBearerAuth("JWT-auth")
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  @ApiOperation({
    summary: "Criar um novo cliente",
    description:
      "Registra um novo cliente no sistema. Aceita pessoa física (F) ou jurídica (J).",
  })
  @ApiBody({ type: CreateClientDto })
  @ApiResponse({
    status: 201,
    description: "Cliente criado com sucesso",
    schema: {
      example: {
        success: true,
        data: {
          client_id: 1,
          name: "João Silva",
          document: "123.456.789-00",
          type: "F",
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: "Dados inválidos ou duplicados" })
  async create(@Body() createClientDto: CreateClientDto) {
    const result = await this.clientsService.create(createClientDto);
    return { success: true, data: result };
  }

  @Get()
  @ApiOperation({
    summary: "Listar todos os clientes",
    description: "Retorna uma lista de clientes com opção de filtros de busca.",
  })
  @ApiResponse({
    status: 200,
    description: "Lista de clientes retornada com sucesso",
    schema: {
      example: {
        success: true,
        data: [
          {
            client_id: 1,
            name: "João Silva",
            document: "123.456.789-00",
            type: "F",
            email: "joao@example.com",
          },
        ],
      },
    },
  })
  findAll(@Query() query: FindClientDto) {
    return this.clientsService.findAll(query);
  }

  @Get(":id")
  @ApiOperation({
    summary: "Buscar cliente por ID",
    description: "Retorna os detalhes de um cliente específico pelo seu ID.",
  })
  @ApiParam({ name: "id", description: "ID do cliente", type: "number" })
  @ApiResponse({
    status: 200,
    description: "Cliente encontrado com sucesso",
    schema: {
      example: {
        client_id: 1,
        name: "João Silva",
        document: "123.456.789-00",
        type: "F",
        email: "joao@example.com",
        phone: "(11) 99999-9999",
      },
    },
  })
  @ApiResponse({ status: 404, description: "Cliente não encontrado" })
  findOne(@Param("id") id: string) {
    return this.clientsService.findOne(id);
  }

  @Patch(":id")
  @ApiOperation({
    summary: "Atualizar um cliente",
    description: "Atualiza os dados de um cliente existente.",
  })
  @ApiParam({ name: "id", description: "ID do cliente", type: "number" })
  @ApiBody({ type: CreateClientDto })
  @ApiResponse({
    status: 200,
    description: "Cliente atualizado com sucesso",
    schema: {
      example: {
        success: true,
        message: "Cliente atualizado com sucesso",
      },
    },
  })
  @ApiResponse({ status: 404, description: "Cliente não encontrado" })
  @ApiResponse({ status: 400, description: "Dados inválidos" })
  update(@Param("id") id: string, @Body() updateClientDto: UpdateClientDto) {
    return this.clientsService.update(id, updateClientDto);
  }

  @Delete(":id")
  @ApiOperation({
    summary: "Deletar um cliente",
    description: "Remove um cliente do sistema.",
  })
  @ApiParam({ name: "id", description: "ID do cliente", type: "number" })
  @ApiResponse({
    status: 200,
    description: "Cliente deletado com sucesso",
    schema: {
      example: {
        success: true,
        message: "Cliente deletado com sucesso",
      },
    },
  })
  @ApiResponse({ status: 404, description: "Cliente não encontrado" })
  remove(@Param("id") id: string) {
    return this.clientsService.remove(id);
  }
}
