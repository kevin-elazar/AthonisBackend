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
            createQueryBuilder: jest.fn(),
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

    /** Resultado de cada UPDATE condicional, na ordem em que acontecem. */
    let execute: jest.Mock;
    let sets: unknown[];
    let wheres: Array<{ sql: string; params: unknown }>;
    let proximoId: number;

    beforeEach(() => {
      refreshRepository = (service as any).refreshTokenRepository;
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser as User);

      execute = jest.fn().mockResolvedValue({ affected: 1 });
      sets = [];
      wheres = [];
      const qb: any = {
        update: jest.fn(() => qb),
        set: jest.fn((valores) => {
          sets.push(valores);
          return qb;
        }),
        where: jest.fn((sql, params) => {
          wheres.push({ sql, params });
          return qb;
        }),
        execute,
      };
      (refreshRepository.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      proximoId = 100;
      (refreshRepository.save as jest.Mock).mockImplementation((token) =>
        Promise.resolve({ ...token, id: proximoId++ }),
      );
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

    it('troca um token válido por um novo par e marca o antigo, com o sucessor, só se ainda não trocado', async () => {
      jest.spyOn(refreshRepository, 'findOne').mockResolvedValue(guardado());

      const result = await service.refresh('token-do-aparelho');

      expect(result.access_token).toBe('mock-jwt-token');
      expect(sets[0]).toEqual({ replaced_at: expect.any(Date), replaced_by_id: 100 });
      expect(wheres[0]).toEqual({ sql: 'id = :id AND replaced_at IS NULL', params: { id: 9 } });
    });

    it('duas trocas simultâneas: a que perde não abre outra cadeia', async () => {
      // A outra troca marcou primeiro e o sucessor dela (50) já foi usado.
      jest
        .spyOn(refreshRepository, 'findOne')
        .mockResolvedValueOnce(guardado())
        .mockResolvedValueOnce(
          guardado({ replaced_at: new Date(), replaced_by_id: 50 }),
        );
      execute
        .mockResolvedValueOnce({ affected: 0 }) // marcar a troca: perdeu
        .mockResolvedValueOnce({ affected: 0 }); // revogar o sucessor 50: já foi usado

      await expect(service.refresh('token-do-aparelho')).rejects.toThrow(UnauthorizedException);
      // O sucessor criado por esta tentativa é revogado.
      expect(refreshRepository.update).toHaveBeenCalledWith({ id: 100 }, { revoked_at: expect.any(Date) });
    });

    it('dentro da tolerância troca de novo, revogando o sucessor que não chegou ao aparelho', async () => {
      jest
        .spyOn(refreshRepository, 'findOne')
        .mockResolvedValue(
          guardado({ replaced_at: new Date(Date.now() - 30_000), replaced_by_id: 50 }),
        );

      await expect(service.refresh('token-do-aparelho')).resolves.toHaveProperty('refresh_token');

      expect(sets[0]).toEqual({ revoked_at: expect.any(Date) });
      expect(wheres[0].params).toEqual({ id: 50 });
      expect(wheres[0].sql).toContain('replaced_at IS NULL AND revoked_at IS NULL');
      expect(sets[1]).toEqual({ replaced_by_id: 100 });
      expect(wheres[1]).toEqual({
        sql: 'id = :id AND replaced_by_id = :sucessorId',
        params: { id: 9, sucessorId: 50 },
      });
    });

    it('dentro da tolerância recusa se o sucessor já foi usado', async () => {
      jest
        .spyOn(refreshRepository, 'findOne')
        .mockResolvedValue(
          guardado({ replaced_at: new Date(Date.now() - 30_000), replaced_by_id: 50 }),
        );
      execute.mockResolvedValueOnce({ affected: 0 });

      await expect(service.refresh('token-do-aparelho')).rejects.toThrow(UnauthorizedException);
      expect(refreshRepository.save).not.toHaveBeenCalled();
    });

    it('dentro da tolerância, se outra repetição ligou o sucessor antes, recusa e revoga o novo', async () => {
      jest
        .spyOn(refreshRepository, 'findOne')
        .mockResolvedValue(guardado({ replaced_at: new Date(Date.now() - 30_000) }));
      execute.mockResolvedValueOnce({ affected: 0 }); // ligar o sucessor

      await expect(service.refresh('token-do-aparelho')).rejects.toThrow(UnauthorizedException);
      expect(wheres[0].sql).toBe('id = :id AND replaced_by_id IS NULL');
      expect(refreshRepository.update).toHaveBeenCalledWith({ id: 100 }, { revoked_at: expect.any(Date) });
    });

    it('recusa token trocado há mais tempo que a tolerância e derruba as sessões do usuário', async () => {
      const warn = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
      jest
        .spyOn(refreshRepository, 'findOne')
        .mockResolvedValue(guardado({ replaced_at: new Date(Date.now() - 10 * 60_000) }));

      await expect(service.refresh('token-do-aparelho')).rejects.toThrow(UnauthorizedException);

      expect(sets[0]).toEqual({ revoked_at: expect.any(Date) });
      expect(wheres[0]).toEqual({
        sql: 'user_id = :userId AND revoked_at IS NULL',
        params: { userId: 1 },
      });
      // O aviso identifica o usuário pelo id, nunca pelo e-mail.
      expect(warn.mock.calls[0][0]).toContain('usuário 1');
      expect(warn.mock.calls[0][0]).not.toContain('@');
    });

    it('a troca que perde a corrida e encontra o token revogado recusa', async () => {
      jest
        .spyOn(refreshRepository, 'findOne')
        .mockResolvedValueOnce(guardado())
        .mockResolvedValueOnce(guardado({ replaced_at: new Date(), revoked_at: new Date() }));
      execute.mockResolvedValueOnce({ affected: 0 });

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

    it('login não registra o e-mail no log (LGPD)', async () => {
      const log = jest.spyOn((service as any).logger, 'log').mockImplementation(() => undefined);
      const error = jest.spyOn((service as any).logger, 'error').mockImplementation(() => undefined);

      await service.login(loginDto);
      jest.spyOn(userRepository, 'findOne').mockResolvedValueOnce(null);
      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);

      const linhas = [...log.mock.calls, ...error.mock.calls].map((args) => String(args[0]));
      expect(linhas.join('\n')).not.toContain(loginDto.email);
      // Credencial errada não é erro do servidor.
      expect(error).not.toHaveBeenCalled();
    });

    it('recusa quando o usuário foi desativado', async () => {
      jest.spyOn(refreshRepository, 'findOne').mockResolvedValue(guardado());
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);

      await expect(service.refresh('token-do-aparelho')).rejects.toThrow(UnauthorizedException);
    });
  });
});
