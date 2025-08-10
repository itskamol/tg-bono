import { Module } from '@nestjs/common';
import { UsersUpdate, AddUserScene } from './users.update';

@Module({
  providers: [UsersUpdate, AddUserScene],
})
export class UsersModule {}
