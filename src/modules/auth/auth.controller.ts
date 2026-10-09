import { 
  Controller, 
  Post, 
  Body, 
  Get, 
  UseGuards,
  Request,
  HttpCode,
  HttpStatus
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiBearerAuth 
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { Public } from './decorators/public.decorator';
import { AllowDriver } from './decorators/allow-driver.decorator';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@ApiTags('Autenticação')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ 
    summary: 'Registrar novo usuário (Apenas Admin)',
    description: 'Apenas usuários com role "admin" podem registrar novos usuários no sistema.'
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Usuário registrado com sucesso',
    type: AuthResponseDto 
  })
  @ApiResponse({ status: 401, description: 'Não autorizado - Token inválido ou ausente' })
  @ApiResponse({ status: 403, description: 'Proibido - Apenas administradores podem registrar usuários' })
  @ApiResponse({ status: 409, description: 'Email já cadastrado' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  async register(@Body() registerDto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Fazer login' })
  @ApiResponse({ 
    status: 200, 
    description: 'Login realizado com sucesso',
    type: AuthResponseDto 
  })
  @ApiResponse({ status: 401, description: 'Credenciais inválidas' })
  async login(@Body() loginDto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(loginDto);
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Renovar a sessão',
    description:
      'Troca o refresh token por um novo par de tokens. O refresh token usado deixa de valer.',
  })
  @ApiResponse({ status: 200, description: 'Novo par de tokens', type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Refresh token inválido, expirado ou revogado' })
  async refresh(@Body() dto: RefreshTokenDto): Promise<AuthResponseDto> {
    return this.authService.refresh(dto.refresh_token);
  }

  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Encerrar a sessão',
    description:
      'Revoga o refresh token. É público porque o access token pode já ter expirado quando o usuário decide sair.',
  })
  @ApiResponse({ status: 204, description: 'Sessão encerrada' })
  async logout(@Body() dto: RefreshTokenDto): Promise<void> {
    await this.authService.logout(dto.refresh_token);
  }

  @Get('profile')
  @AllowDriver()
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Obter perfil do usuário autenticado' })
  @ApiResponse({ 
    status: 200, 
    description: 'Perfil do usuário retornado com sucesso' 
  })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  async getProfile(@Request() req) {
    return this.authService.getProfile(req.user.id);
  }
}

