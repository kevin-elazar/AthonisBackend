# Athonis Backend - Sistema de Logística e Otimização de Rotas

API RESTful desenvolvida em NestJS para gerenciamento completo de logística, incluindo pedidos, clientes, motoristas, veículos e otimização de rotas utilizando Google Maps Route Optimization API.

## 📋 Índice

- [Sobre o Projeto](#sobre-o-projeto)
- [Funcionalidades](#funcionalidades)
- [Tecnologias Utilizadas](#tecnologias-utilizadas)
- [Pré-requisitos](#pré-requisitos)
- [Instalação](#instalação)
- [Configuração](#configuração)
- [Executando o Projeto](#executando-o-projeto)
- [Documentação da API](#documentação-da-api)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Módulos Disponíveis](#módulos-disponíveis)
- [Autenticação](#autenticação)
- [Testando a API](#testando-a-api)
- [Scripts Disponíveis](#scripts-disponíveis)

## 🎯 Sobre o Projeto

O **Athonis Backend** é uma solução completa para empresas de logística que necessitam gerenciar entregas, otimizar rotas e acompanhar o histórico de operações. O sistema permite:

- Cadastro e gerenciamento de clientes, pedidos, motoristas e veículos
- Importação em massa de pedidos via arquivos CSV
- Otimização inteligente de rotas utilizando a API do Google Maps
- Histórico completo de rotas otimizadas
- Autenticação segura com JWT e controle de acesso baseado em roles

## ✨ Funcionalidades

### 🔐 Autenticação
- Login e registro de usuários
- Autenticação via JWT (JSON Web Tokens)
- Controle de acesso baseado em roles (Admin/User)
- Endpoint para obter perfil do usuário autenticado

### 👥 Gestão de Clientes
- CRUD completo de clientes
- Suporte para pessoas físicas (F) e jurídicas (J)
- Busca e filtros de clientes

### 📦 Gestão de Pedidos
- CRUD completo de pedidos
- Classificação por urgência (normal, alta, crítica)
- Associação de pedidos a clientes
- Filtros e buscas avançadas
- Rastreamento de status de entregas

### 🚗 Gestão de Motoristas
- Cadastro e gerenciamento de motoristas
- Informações de documentos e habilitação
- Controle de disponibilidade

### 🚛 Gestão de Veículos
- Cadastro de frota de veículos
- Controle de capacidade e especificações
- Associação de veículos a motoristas

### 📥 Importação de Pedidos
- Importação em massa via arquivos CSV
- Validação de dados durante a importação
- Geração automática de arquivo de rejeições
- Download de relatórios de erros

### 🗺️ Otimização de Rotas
- Otimização inteligente de rotas usando Google Maps Route Optimization API
- Agrupamento automático de pedidos por rota
- Cálculo de distâncias e tempos estimados
- Validação prévia de pedidos antes da otimização

### 📊 Histórico de Rotas
- Armazenamento completo do histórico de otimizações
- Consulta por IDs de pedidos
- Consulta por intervalo de datas
- Detalhamento completo de cada otimização

## 🛠️ Tecnologias Utilizadas

- **[NestJS](https://nestjs.com/)** - Framework Node.js progressivo
- **[TypeORM](https://typeorm.io/)** - ORM para TypeScript/JavaScript
- **[SQLite](https://www.sqlite.org/)** - Banco de dados relacional
- **[Passport](http://www.passportjs.org/)** + **JWT** - Autenticação e autorização
- **[Swagger/OpenAPI](https://swagger.io/)** - Documentação interativa da API
- **[Google Maps APIs](https://developers.google.com/maps)** - Otimização de rotas e geocodificação
- **[class-validator](https://github.com/typestack/class-validator)** - Validação de DTOs
- **[Winston](https://github.com/winstonjs/winston)** - Sistema de logging
- **[TypeScript](https://www.typescriptlang.org/)** - Linguagem de programação

## 📦 Pré-requisitos

Antes de começar, você precisa ter instalado em sua máquina:

- **Node.js** (versão 18 ou superior)
- **npm** ou **yarn**
- **Google Cloud Platform Account** (para usar as APIs do Google Maps)
  - Chave de API do Google Maps Route Optimization API
  - Arquivo de credenciais JSON (client_secret.json)

## 🚀 Instalação

1. **Clone o repositório:**
```bash
git clone <url-do-repositorio>
cd AthonisBackend
```

2. **Instale as dependências:**
```bash
npm install
```

3. **Configure as variáveis de ambiente:**
Crie um arquivo `.env` na raiz do projeto com as seguintes variáveis:

```env
# Banco de Dados
DB_TYPE=sqlite
DB_NAME=./src/database/database.sqlite

# Servidor
PORT=8080

# JWT
JWT_SECRET=seu-secret-super-seguro-aqui
JWT_EXPIRATION=1h

# Google Maps API (opcional - necessário apenas para otimização de rotas)
GOOGLE_MAPS_API_KEY=sua-chave-da-api-google-maps
```

4. **Configure as credenciais do Google Cloud:**
   - Coloque o arquivo `client_secret.json` na raiz do projeto
   - Este arquivo contém as credenciais do Google Cloud Platform

## ⚙️ Configuração

### Configuração do Banco de Dados

O projeto utiliza SQLite por padrão. O banco de dados será criado automaticamente na primeira execução em `src/database/database.sqlite`.

Para usar outro banco de dados, edite o arquivo `src/config/database.config.ts` e configure as variáveis de ambiente adequadas.

### Configuração do Google Maps

Para utilizar a funcionalidade de otimização de rotas:

1. Crie um projeto no [Google Cloud Platform](https://console.cloud.google.com/)
2. Habilite as seguintes APIs:
   - Google Maps Route Optimization API
   - Google Maps Geocoding API
3. Crie uma chave de API e adicione ao arquivo `.env`
4. Baixe o arquivo de credenciais JSON do serviço de conta e salve como `client_secret.json` na raiz do projeto

## 🏃 Executando o Projeto

### Desenvolvimento
```bash
npm run start:dev
```
O servidor será iniciado em modo watch, recarregando automaticamente quando houver alterações no código.

### Produção
```bash
npm run build
npm run start:prod
```

### Debug
```bash
npm run start:debug
```

## 📚 Documentação da API

O projeto utiliza Swagger/OpenAPI para documentação interativa. Após iniciar o servidor, acesse:

**http://localhost:8080/api**

Na documentação Swagger você encontrará:
- Todas as rotas disponíveis
- Modelos de requisição e resposta
- Exemplos de uso
- Testes interativos de cada endpoint

### Testando os Endpoints no Swagger

1. Acesse `http://localhost:8080/api` no navegador
2. Clique no botão **"Authorize"** (cadeado no topo)
3. Faça login através do endpoint `/auth/login` para obter o token JWT
4. Cole o token no campo de autorização do Swagger (formato: `Bearer seu-token-aqui`)
5. Agora você pode testar todos os endpoints protegidos

## 📁 Estrutura do Projeto

```
AthonisBackend/
├── src/
│   ├── config/                 # Configurações (banco, env, logging)
│   ├── database/               # Banco de dados SQLite
│   ├── filters/                # Filtros de exceções HTTP
│   ├── modules/                # Módulos da aplicação
│   │   ├── auth/               # Autenticação e autorização
│   │   ├── clients/            # Gestão de clientes
│   │   ├── drivers/            # Gestão de motoristas
│   │   ├── orders/             # Gestão de pedidos
│   │   ├── order-imports/      # Importação de pedidos
│   │   └── vehicles/           # Gestão de veículos
│   ├── optimization-routes/    # Módulo de otimização de rotas
│   │   ├── controllers/        # Controllers de otimização
│   │   ├── services/           # Serviços de otimização
│   │   └── dto/                # DTOs de otimização
│   ├── shared/                 # Código compartilhado
│   │   ├── entities/           # Entidades do banco de dados
│   │   └── interceptors/       # Interceptors HTTP
│   └── main.ts                 # Ponto de entrada da aplicação
├── dist/                       # Código compilado
├── exemplos/                   # Arquivos de exemplo (CSV, SQL)
├── importacoes/                # Diretório para arquivos de importação
├── client_secret.json          # Credenciais do Google Cloud
├── package.json
├── tsconfig.json
└── README.md
```

## 🧩 Módulos Disponíveis

### 🔐 Autenticação (`/auth`)
- `POST /auth/login` - Fazer login
- `POST /auth/register` - Registrar novo usuário (apenas Admin)
- `GET /auth/profile` - Obter perfil do usuário autenticado

### 👥 Clientes (`/clients`)
- `POST /clients` - Criar cliente
- `GET /clients` - Listar clientes (com filtros)
- `GET /clients/:id` - Buscar cliente por ID
- `PATCH /clients/:id` - Atualizar cliente
- `DELETE /clients/:id` - Deletar cliente

### 📦 Pedidos (`/orders`)
- `POST /orders` - Criar pedido
- `GET /orders` - Listar pedidos (com filtros)
- `GET /orders/:id` - Buscar pedido por ID
- `PATCH /orders/:id` - Atualizar pedido
- `DELETE /orders/:id` - Deletar pedido

### 🚗 Motoristas (`/drivers`)
- `POST /drivers` - Criar motorista
- `GET /drivers` - Listar motoristas (com filtros)
- `GET /drivers/:id` - Buscar motorista por ID
- `PATCH /drivers/:id` - Atualizar motorista
- `DELETE /drivers/:id` - Deletar motorista

### 🚛 Veículos (`/vehicles`)
- `POST /vehicles` - Criar veículo
- `GET /vehicles` - Listar veículos (com filtros)
- `GET /vehicles/:id` - Buscar veículo por ID
- `PATCH /vehicles/:id` - Atualizar veículo
- `DELETE /vehicles/:id` - Deletar veículo

### 📥 Importação de Pedidos (`/order-imports`)
- `POST /order-imports/upload` - Upload de arquivo CSV para importação
- `GET /order-imports/download-rejected/:filename` - Download de arquivo de rejeições

### 🗺️ Otimização de Rotas (`/optimization-routes`)
- `POST /optimization-routes/optimize` - Otimizar rotas para uma lista de pedidos
- `POST /optimization-routes/validate-orders` - Validar pedidos antes da otimização

### 📊 Histórico de Rotas (`/optimized-routes-history`)
- `GET /optimized-routes-history` - Listar todos os históricos
- `GET /optimized-routes-history/:id` - Buscar histórico por ID
- `GET /optimized-routes-history/by-order-ids?orderIds=1,2,3` - Buscar por IDs de pedidos
- `GET /optimized-routes-history/by-date-range?startDate=...&endDate=...` - Buscar por intervalo de datas
- `DELETE /optimized-routes-history/:id` - Deletar histórico

## 🔒 Autenticação

Todas as rotas (exceto `/auth/login`) requerem autenticação via JWT. Para acessar endpoints protegidos:

1. **Faça login:**
```bash
POST /auth/login
Content-Type: application/json

{
  "email": "usuario@example.com",
  "password": "senha123"
}
```

2. **Use o token retornado:**
Adicione o token no header de todas as requisições:
```
Authorization: Bearer seu-token-jwt-aqui
```

### Roles Disponíveis

- **admin**: Acesso total ao sistema, pode registrar novos usuários
- **user**: Acesso padrão ao sistema (sem permissão para registrar usuários)

## 🧪 Testando a API

### 1. Usando o Swagger UI

A forma mais fácil de testar a API é através da interface Swagger:

1. Inicie o servidor: `npm run start:dev`
2. Acesse: `http://localhost:8080/api`
3. Faça login e obtenha o token
4. Autorize no Swagger usando o botão "Authorize"
5. Teste os endpoints diretamente na interface

### 2. Usando cURL

#### Exemplo: Login
```bash
curl -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "senha123"
  }'
```

#### Exemplo: Criar Cliente (com autenticação)
```bash
curl -X POST http://localhost:8080/clients \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer seu-token-aqui" \
  -d '{
    "name": "João Silva",
    "document": "123.456.789-00",
    "type": "F",
    "email": "joao@example.com",
    "phone": "(11) 99999-9999"
  }'
```

#### Exemplo: Otimizar Rotas
```bash
curl -X POST http://localhost:8080/optimization-routes/optimize \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer seu-token-aqui" \
  -d '{
    "orderIds": [1, 2, 3, 4, 5]
  }'
```

### 3. Usando Postman/Insomnia

1. Importe a coleção do Swagger (disponível em `http://localhost:8080/api-json`)
2. Configure a variável de ambiente `token` com o JWT obtido no login
3. Use `{{token}}` nas requisições que requerem autenticação

### 4. Usando o Exemplo de Importação

1. Verifique o arquivo `exemplos/modelo_importacao_pedidos.csv` como referência
2. Faça upload do arquivo CSV através do endpoint `/order-imports/upload`
3. Acompanhe o resultado da importação

## 📝 Scripts Disponíveis

```bash
# Desenvolvimento (modo watch)
npm run start:dev

# Build para produção
npm run build

# Executar em produção
npm run start:prod

# Executar com debug
npm run start:debug

# Formatar código
npm run format

# Limpar pasta dist antes do build
npm run prebuild
```

## 📌 Notas Importantes

### Segurança
- ⚠️ **Nunca commite** o arquivo `.env` ou `client_secret.json` no repositório
- ⚠️ Altere o `JWT_SECRET` para um valor seguro em produção
- ⚠️ Configure CORS adequadamente para produção

### Banco de Dados
- O banco SQLite é criado automaticamente na primeira execução
- Para resetar o banco, delete o arquivo `src/database/database.sqlite`
- Use o arquivo `exemplos/insert-data.sql` para inserir dados de exemplo

### Importação de Pedidos
- O formato do CSV deve seguir o modelo em `exemplos/modelo_importacao_pedidos.csv`
- Arquivos de rejeição são salvos em `importacoes/rejeicao/`
- Tamanho máximo do arquivo: 10MB

### Otimização de Rotas
- Requer credenciais válidas do Google Cloud Platform
- Consome créditos da API do Google Maps
- Limite de pedidos por otimização pode variar conforme o plano da API

## 🤝 Contribuindo

1. Faça um fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença ISC.

## 👨‍💻 Autor

Athonis Backend - Sistema de Logística

---

**Desenvolvido com ❤️ usando NestJS**

