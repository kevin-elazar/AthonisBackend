import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../../src/shared/entities/user.entity';

const TEST_USER = {
  email: 'admin@athonis.com',
  password: 'admin123',
  name: 'Admin',
  role: 'admin' as const,
  id_company: 1000,
  is_active: true,
};

export async function seedTestUser(dataSource: DataSource): Promise<User> {
  const userRepository = dataSource.getRepository(User);

  const existingUser = await userRepository.findOne({
    where: { email: TEST_USER.email },
  });

  if (existingUser) {
    return existingUser;
  }

  const hashedPassword = await bcrypt.hash(TEST_USER.password, 10);

  const user = userRepository.create({
    email: TEST_USER.email,
    password: hashedPassword,
    name: TEST_USER.name,
    role: TEST_USER.role,
    id_company: TEST_USER.id_company,
    is_active: TEST_USER.is_active,
  });

  return userRepository.save(user);
}
