import { Module } from '@nestjs/common';
import { UsersUpdate } from './users.update';
import { AddUserScene, DeleteUserScene, EditNameScene } from './scenes';
import { EditUserScene } from './scenes/edit-user.scene';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    providers: [UsersUpdate, AddUserScene, DeleteUserScene, EditNameScene, EditUserScene],
})
export class UsersModule {}
