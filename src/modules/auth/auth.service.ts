import { Injectable, UnauthorizedException, ConflictException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { User } from '../../shared/entities/user.entity';
import { RefreshToken } from '../../shared/entities/refresh-token.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { TenantContextService } from '../../shared/tenant/tenant-context.service';
import { config } from '../../config/env.config';

/**
 * Por quanto tempo um refresh token já trocado continua valendo. Cobre o
 * caso em que a resposta da troca se perde e o aparelho repete o pedido.
 */
const ROTATION_GRACE_MS = 2 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private refreshTokenRepository: Repository<RefreshToken>,
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
      const adminUser = this.tenantContext.getUser();
      const createdBy = adminUser?.email ?? undefined;

      const user = this.userRepository.create({
        email: registerDto.email,
        password: hashedPassword,
        name: registerDto.name,
        role: registerDto.role || 'user',
        id_company: idCompany,
        is_active: true,
        created_by: createdBy,
      });

      const savedUser = await this.userRepository.save(user);

      this.logger.log(`Novo usuário registrado: ${savedUser.email}`);

      // Gerar token JWT
      return await this.generateAuthResponse(savedUser);
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
      return await this.generateAuthResponse(user, loginDto.device);
    } catch (error) {
      this.logger.error('Erro ao fazer login:', error);
      throw error;
    }
  }

  /**
   * Troca um refresh token por um novo par. O token usado deixa de valer
   * (salvo pela tolerância de ROTATION_GRACE_MS), de modo que um token
   * copiado tem vida curta.
   */
  async refresh(refreshToken: string): Promise<AuthResponseDto> {
    const stored = await this.refreshTokenRepository.findOne({
      where: { token_hash: this.hashToken(refreshToken) },
    });

    const agora = Date.now();
    const trocadoHaPouco =
      !!stored?.replaced_at && agora - new Date(stored.replaced_at).getTime() < ROTATION_GRACE_MS;

    if (
      !stored ||
      stored.revoked_at ||
      new Date(stored.expires_at).getTime() <= agora ||
      (stored.replaced_at && !trocadoHaPouco)
    ) {
      throw new UnauthorizedException('Sessão expirada. Faça login novamente.');
    }

    const user = await this.userRepository.findOne({
      where: { id: stored.user_id, is_active: true },
    });
    if (!user) {
      throw new UnauthorizedException('Sessão expirada. Faça login novamente.');
    }

    if (!stored.replaced_at) {
      await this.refreshTokenRepository.update({ id: stored.id }, { replaced_at: new Date() });
    }

    return this.generateAuthResponse(user, stored.device);
  }

  /** Encerra a sessão do aparelho. Não falha se o token já não existir. */
  async logout(refreshToken: string): Promise<void> {
    await this.refreshTokenRepository.update(
      { token_hash: this.hashToken(refreshToken) },
      { revoked_at: new Date() },
    );
  }

  /** Derruba todas as sessões de um usuário — usado ao trocar a senha ou desativar o acesso. */
  async revokeAllSessions(userId: number): Promise<void> {
    await this.refreshTokenRepository
      .createQueryBuilder()
      .update(RefreshToken)
      .set({ revoked_at: new Date() })
      .where('user_id = :userId AND revoked_at IS NULL', { userId })
      .execute();
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

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Gera resposta de autenticação com access token e refresh token
   */
  private async generateAuthResponse(user: User, device?: string): Promise<AuthResponseDto> {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      id_company: user.id_company
    };

    const access_token = this.jwtService.sign(payload);
    const decoded = this.jwtService.decode(access_token) as { exp?: number; iat?: number } | null;
    const expires_in = decoded?.exp && decoded?.iat ? decoded.exp - decoded.iat : 3600;

    const refresh_token = randomBytes(48).toString('base64url');
    await this.refreshTokenRepository.save(
      this.refreshTokenRepository.create({
        user_id: user.id,
        token_hash: this.hashToken(refresh_token),
        expires_at: new Date(Date.now() + config.jwt.refreshDays * 24 * 60 * 60 * 1000),
        device: device ?? undefined,
      }),
    );

    return {
      access_token,
      refresh_token,
      token_type: 'Bearer',
      expires_in,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        id_company: user.id_company,
        driver_id: user.driver_id ?? null,
      },
    };
  }
}
