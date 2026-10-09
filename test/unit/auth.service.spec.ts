import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthService } from '@/modules/auth/auth.service';
import { User } from '@/shared/entities/user.entity';
import { RefreshToken } from '@/shared/entities/refresh-token.entity';
import { TenantContextService } from '@/shared/tenant/tenant-context.service';
import { loginDto, registerDto } from '../fixtures/auth.fixtures';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashedPassword'),
  compare: jest.fn().mockResolvedValue(true),
}));

describe('AuthService', () => {
  let service: AuthService;
  let userRepository: Repository<User>;
  let jwtService: JwtService;
  let tenantContext: TenantContextService;

  const mockUser = {
    id: 1,
    email: 'admin@athonis.com',
    password: 'hashedPassword',
    name: 'Admin',
    role: 'admin' as const,
    id_company: 1000,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn().mockImplementation((dto) => ({ ...dto, id: 1 })),
            save: jest.fn().mockImplementation((user) => Promise.resolve({ ...user, id: 1 })),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mock-jwt-token'),
            decode: jest.fn().mockReturnValue({ iat: 1000, exp: 4600 }),
          },
        },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn().mockImplementation((dto) => dto),
            save: jest.fn().mockImplementation((token) => Promise.resolve({ ...token, id: 1 })),
            update: jest.fn().mockResolvedValue({ affected: 1 }),
          },
        },
        {
          provide: TenantContextService,
          useValue: {
            getIdCompany: jest.fn().mockReturnValue(1000),
            getUser: jest.fn().mockReturnValue({ email: 'admin@athonis.com' }),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    jwtService = module.get<JwtService>(JwtService);
    tenantContext = module.get<TenantContextService>(TenantContextService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('deve retornar access_token com credenciais válidas', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser as User);

      const result = await service.login(loginDto);

      expect(result).toHaveProperty('access_token', 'mock-jwt-token');
      expect(result).toHaveProperty('token_type', 'Bearer');
      expect(result).toHaveProperty('user');
      expect(result.user).toHaveProperty('email', loginDto.email);
    });

    it('deve lançar UnauthorizedException quando usuário não existe', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('deve lançar UnauthorizedException quando senha é inválida', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser as User);
      const bcrypt = require('bcrypt');
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('deve lançar UnauthorizedException quando usuário está inativo', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue({ ...mockUser, is_active: false } as User);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('register', () => {
    it('deve lançar ConflictException quando email já existe', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser as User);

      await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
    });

    it('deve registrar novo usuário com sucesso', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);

      const result = await service.register(registerDto);

      expect(result).toHaveProperty('access_token');
      expect(result.user).toHaveProperty('email', registerDto.email);
      expect(userRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: registerDto.email,
          name: registerDto.name,
          role: 'user' as const,
          id_company: 1000,
          is_active: true,
          created_by: 'admin@athonis.com',
        }),
      );
    });
  });

  describe('getProfile', () => {
    it('deve retornar perfil do usuário sem senha', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser as User);

      const result = await service.getProfile(1);

      expect(result).not.toHaveProperty('password');
      expect(result).toHaveProperty('email', mockUser.email);
    });

    it('deve lançar UnauthorizedException quando usuário não existe', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);

      await expect(service.getProfile(999)).rejects.toThrow(UnauthorizedException);
    });
  });

  /**
   * A renovação é o que mantém o entregador logado o dia inteiro. O que
   * importa: token trocado deixa de valer, mas não na hora — a resposta da
   * troca pode se perder em rede ruim e o aparelho repete o pedido.
   */
  describe('refresh', () => {
    let refreshRepository: Repository<RefreshToken>;

    const guardado = (extra: Partial<RefreshToken> = {}) =>
      ({
        id: 9,
        user_id: 1,
        token_hash: 'hash',
        expires_at: new Date(Date.now() + 60_000),
        ...extra,
      }) as RefreshToken;

    beforeEach(() => {
      refreshRepository = (service as any).refreshTokenRepository;
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser as User);
    });

    it('login devolve refresh_token e expires_in calculado do token', async () => {
      const result = await service.login(loginDto);

      expect(result.refresh_token).toEqual(expect.any(String));
      expect(result.expires_in).toBe(3600);
      expect(refreshRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 1, token_hash: expect.stringMatching(/^[0-9a-f]{64}$/) }),
      );
    });

    it('não guarda o refresh token em texto puro', async () => {
      const result = await service.login(loginDto);
      const salvo = (refreshRepository.save as jest.Mock).mock.calls[0][0];

      expect(salvo.token_hash).not.toBe(result.refresh_token);
    });

    it('troca um token válido por um novo par e marca o antigo como trocado', async () => {
      jest.spyOn(refreshRepository, 'findOne').mockResolvedValue(guardado());

      const result = await service.refresh('token-do-aparelho');

      expect(result.access_token).toBe('mock-jwt-token');
      expect(refreshRepository.update).toHaveBeenCalledWith(
        { id: 9 },
        { replaced_at: expect.any(Date) },
      );
    });

    it('aceita o token antigo de novo dentro da tolerância', async () => {
      jest
        .spyOn(refreshRepository, 'findOne')
        .mockResolvedValue(guardado({ replaced_at: new Date(Date.now() - 30_000) }));

      await expect(service.refresh('token-do-aparelho')).resolves.toHaveProperty('refresh_token');
    });

    it('recusa token trocado há mais tempo que a tolerância', async () => {
      jest
        .spyOn(refreshRepository, 'findOne')
        .mockResolvedValue(guardado({ replaced_at: new Date(Date.now() - 10 * 60_000) }));

      await expect(service.refresh('token-do-aparelho')).rejects.toThrow(UnauthorizedException);
    });

    it('recusa token revogado, expirado ou desconhecido', async () => {
      const findOne = jest.spyOn(refreshRepository, 'findOne');

      findOne.mockResolvedValueOnce(guardado({ revoked_at: new Date() }));
      await expect(service.refresh('x')).rejects.toThrow(UnauthorizedException);

      findOne.mockResolvedValueOnce(guardado({ expires_at: new Date(Date.now() - 1000) }));
      await expect(service.refresh('x')).rejects.toThrow(UnauthorizedException);

      findOne.mockResolvedValueOnce(null);
      await expect(service.refresh('x')).rejects.toThrow(UnauthorizedException);
    });

    it('recusa quando o usuário foi desativado', async () => {
      jest.spyOn(refreshRepository, 'findOne').mockResolvedValue(guardado());
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);

      await expect(service.refresh('token-do-aparelho')).rejects.toThrow(UnauthorizedException);
    });
  });
});
