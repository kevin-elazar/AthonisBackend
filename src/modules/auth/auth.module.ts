import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { User } from "../../shared/entities/user.entity";
import { TenantModule } from "@/shared/tenant/tenant.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    TenantModule,
    PassportModule.register({ defaultStrategy: "jwt", session: false }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || "your-secret-key-change-in-production",
      signOptions: {
        expiresIn: "1h", // 1 hora de validade do token
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtStrategy],
})
export class AuthModule {}
