import { Injectable, UnauthorizedException, ConflictException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../../shared/entities/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { TenantContextService } from '../../shared/tenant/tenant-context.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
    private tenantContext: TenantContextService,
  ) {}

  /**
   * Registra um novo usuário
   */
  async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
    try {
      // Verificar se email já existe
      const existingUser = await this.userRepository.findOne({
        where: { email: registerDto.email }
      });

      if (existingUser) {
        throw new ConflictException('Email já cadastrado');
      }

      // Hash da senha
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(registerDto.password, saltRounds);

      // Criar usuário com id_company do admin que está registrando
      const idCompany = this.tenantContext.getIdCompany();
      const user = this.userRepository.create({
        email: registerDto.email,
        password: hashedPassword,
        name: registerDto.name,
        role: registerDto.role || 'user',
        id_company: idCompany,
        is_active: true,
      });

      const savedUser = await this.userRepository.save(user);

      this.logger.log(`Novo usuário registrado: ${savedUser.email}`);

      // Gerar token JWT
      return this.generateAuthResponse(savedUser);
    } catch (error) {
      this.logger.error('Erro ao registrar usuário:', error);
      throw error;
    }
  }

  /**
   * Autentica um usuário
   */
  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    try {
      // Buscar usuário por email
      const user = await this.userRepository.findOne({
        where: { email: loginDto.email }
      });

      if (!user) {
        throw new UnauthorizedException('Credenciais inválidas');
      }

      // Verificar se usuário está ativo
      if (!user.is_active) {
        throw new UnauthorizedException('Usuário inativo');
      }

      // Validar senha
      const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);

      if (!isPasswordValid) {
        throw new UnauthorizedException('Credenciais inválidas');
      }

      // Atualizar último login
      user.last_login = new Date();
      await this.userRepository.save(user);

      this.logger.log(`Usuário autenticado: ${user.email}`);

      // Gerar token JWT
      return this.generateAuthResponse(user);
    } catch (error) {
      this.logger.error('Erro ao fazer login:', error);
      throw error;
    }
  }

  /**
   * Valida um usuário pelo ID (usado pela JWT Strategy)
   */
  async validateUser(userId: number): Promise<User | null> {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId, is_active: true }
      });

      return user;
    } catch (error) {
      this.logger.error('Erro ao validar usuário:', error);
      return null;
    }
  }

  /**
   * Busca perfil do usuário
   */
  async getProfile(userId: number): Promise<Omit<User, 'password'>> {
    const user = await this.userRepository.findOne({
      where: { id: userId }
    });

    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado');
    }

    // Remover senha do retorno
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * Gera resposta de autenticação com token JWT
   */
  private generateAuthResponse(user: User): AuthResponseDto {
    const payload = { 
      sub: user.id, 
      email: user.email,
      role: user.role,
      id_company: user.id_company 
    };

    const access_token = this.jwtService.sign(payload);

    return {
      access_token,
      token_type: 'Bearer',
      expires_in: 3600, // 1 hora
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        id_company: user.id_company,
      },
    };
  }
}

