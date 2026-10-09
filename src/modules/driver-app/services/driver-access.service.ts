import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../../../shared/entities/user.entity';
import { Driver } from '../../../shared/entities/driver.entity';
import { TenantContextService } from '../../../shared/tenant/tenant-context.service';
import { AuthService } from '../../auth/auth.service';
import { GrantDriverAccessDto } from '../dto/grant-driver-access.dto';

export interface DriverAccessView {
  driver_id: number;
  has_access: boolean;
  email: string | null;
  is_active: boolean;
  last_login: Date | null;
}

/**
 * Acesso do motorista ao aplicativo, administrado pelo escritório.
 *
 * O cadastro do motorista e o login são coisas separadas de propósito: a
 * empresa pode ter motoristas que não usam o app, e desligar o acesso de
 * alguém não deve apagar o histórico de entregas dele.
 */
@Injectable()
export class DriverAccessService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Driver)
    private driverRepository: Repository<Driver>,
    private tenantContext: TenantContextService,
    private authService: AuthService,
  ) {}

  async get(driverId: number): Promise<DriverAccessView> {
    const driver = await this.findDriver(driverId);
    const user = await this.findUser(driver.driver_id);
    return this.toView(driver.driver_id, user);
  }

  /** Cria o login ou, se já existir, troca e-mail e senha e reativa o acesso. */
  async grant(driverId: number, dto: GrantDriverAccessDto): Promise<DriverAccessView> {
    const driver = await this.findDriver(driverId);
    const idCompany = this.tenantContext.getIdCompany();
    const autor = this.tenantContext.getUser()?.email ?? undefined;
    const existing = await this.findUser(driver.driver_id);

    // O e-mail é único no sistema inteiro, não por empresa: é a chave do login.
    const emailEmUso = await this.userRepository.findOne({
      where: existing ? { email: dto.email, id: Not(existing.id) } : { email: dto.email },
    });
    if (emailEmUso) {
      throw new ConflictException('Email já cadastrado');
    }

    const password = await bcrypt.hash(dto.password, 10);

    if (existing) {
      await this.userRepository.update(
        { id: existing.id },
        { email: dto.email, password, name: driver.name, is_active: true, updated_by: autor },
      );
      // Senha nova invalida os aparelhos que entraram com a antiga.
      await this.authService.revokeAllSessions(existing.id);
    } else {
      await this.userRepository.save(
        this.userRepository.create({
          email: dto.email,
          password,
          name: driver.name,
          role: 'driver',
          id_company: idCompany,
          driver_id: driver.driver_id,
          is_active: true,
          created_by: autor,
        }),
      );
    }

    return this.toView(driver.driver_id, await this.findUser(driver.driver_id));
  }

  /** Desliga o acesso e derruba as sessões abertas. O histórico do motorista fica. */
  async revoke(driverId: number): Promise<void> {
    const driver = await this.findDriver(driverId);
    const user = await this.findUser(driver.driver_id);
    if (!user) return;

    await this.userRepository.update(
      { id: user.id },
      { is_active: false, updated_by: this.tenantContext.getUser()?.email ?? undefined },
    );
    await this.authService.revokeAllSessions(user.id);
  }

  private async findDriver(driverId: number): Promise<Driver> {
    const driver = await this.driverRepository.findOne({
      where: { driver_id: driverId, id_company: this.tenantContext.getIdCompany() },
    });
    if (!driver) {
      throw new NotFoundException(`Motorista ${driverId} não encontrado`);
    }
    return driver;
  }

  private findUser(driverId: number): Promise<User | null> {
    return this.userRepository.findOne({
      where: { driver_id: driverId, id_company: this.tenantContext.getIdCompany(), role: 'driver' },
    });
  }

  private toView(driverId: number, user: User | null): DriverAccessView {
    return {
      driver_id: driverId,
      has_access: !!user,
      email: user?.email ?? null,
      is_active: user?.is_active ?? false,
      last_login: user?.last_login ?? null,
    };
  }
}
