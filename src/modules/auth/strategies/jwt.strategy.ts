import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../../shared/entities/user.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    });
  }

  async validate(payload: any) {
    // Payload contém: { sub: userId, email: userEmail, role: userRole }
    const user = await this.userRepository.findOne({
      where: { id: payload.sub, is_active: true },
    });

    if (!user) {
      throw new UnauthorizedException('Token inválido ou usuário não encontrado');
    }

    // Retorna dados do usuário que serão anexados ao request
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      id_company: user.id_company,
    };
  }
}

