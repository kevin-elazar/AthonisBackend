import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthService } from '@/modules/auth/auth.service';
import { User } from '@/shared/entities/user.entity';
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
});
