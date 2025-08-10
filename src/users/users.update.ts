import { UseGuards } from '@nestjs/common';
import {
  Update,
  Command,
  Ctx,
  Scene,
  SceneEnter,
  On,
  Message,
} from 'nestjs-telegraf';
import * as bcrypt from 'bcrypt';
import { AuthGuard } from '../auth/guards/auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { PrismaService } from '../prisma/prisma.service';
import { Context } from '../interfaces/context.interface';

@Update()
@UseGuards(AuthGuard)
export class UsersUpdate {
  constructor(private readonly prisma: PrismaService) {}

  @Command('list_users')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async listUsers(@Ctx() ctx: Context) {
    const user = ctx.user;
    let users;

    if (user.role === Role.SUPER_ADMIN) {
      users = await this.prisma.user.findMany({ include: { branch: true } });
    } else if (user.role === Role.ADMIN) {
      if (!user.branch_id) {
        return 'You are not assigned to any branch.';
      }
      users = await this.prisma.user.findMany({
        where: { branch_id: user.branch_id },
        include: { branch: true },
      });
    }

    if (users.length === 0) {
      return 'No users found.';
    }

    const userList = users
      .map(
        (u) =>
          `- ${u.full_name} (@${u.username}) - Role: ${u.role} - Branch: ${
            u.branch?.name || 'N/A'
          }`,
      )
      .join('\n');

    return `Here are the users:\n${userList}`;
  }

  @Command('add_user')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async onAddUser(@Ctx() ctx: Context) {
    await ctx.scene.enter('add-user-scene');
  }
}

@Scene('add-user-scene')
export class AddUserScene {
  constructor(private readonly prisma: PrismaService) {}

  @SceneEnter()
  async onSceneEnter(@Ctx() ctx: Context) {
    const user = ctx.user;
    const sceneState = ctx.scene.state as any;

    if (user.role === Role.SUPER_ADMIN) {
      // Super Admin can choose role
      await ctx.reply(
        'What role should the new user have? (admin / kassir)',
      );
    } else if (user.role === Role.ADMIN) {
      // Admin can only create Kassir
      sceneState.role = Role.KASSIR;
      await ctx.reply(
        'You are creating a new Kassir. Please enter the new user\'s Telegram ID (this must be a number).',
      );
    }
  }

  @On('text')
  async onText(@Ctx() ctx: Context, @Message('text') text: string) {
    const sceneState = ctx.scene.state as any;
    const user = ctx.user;

    // Step 1: Set Role (for Super Admin)
    if (user.role === Role.SUPER_ADMIN && !sceneState.role) {
      const roleInput = text.toLowerCase();
      if (roleInput !== 'admin' && roleInput !== 'kassir') {
        await ctx.reply('Invalid role. Please enter "admin" or "kassir".');
        return;
      }
      sceneState.role = roleInput === 'admin' ? Role.ADMIN : Role.KASSIR;
      await ctx.reply(
        `Role set to ${sceneState.role}. Now, please enter the new user's Telegram ID.`,
      );
      return;
    }

    // Step 2: Set Telegram ID
    if (!sceneState.telegramId) {
      const telegramId = parseInt(text, 10);
      if (isNaN(telegramId)) {
        await ctx.reply('Invalid Telegram ID. Please enter a number.');
        return;
      }
      sceneState.telegramId = telegramId;
      await ctx.reply(
        `Telegram ID set. Now, please enter the user's Full Name.`,
      );
      return;
    }

    // Step 3: Set Full Name
    if (!sceneState.fullName) {
      sceneState.fullName = text;
      await ctx.reply(`Full Name set. Now, please enter a username (for login).`);
      return;
    }

    // Step 4: Set Username
    if (!sceneState.username) {
      sceneState.username = text;
      await ctx.reply(`Username set. Now, please enter a temporary password.`);
      return;
    }

    // Step 5: Set Password and maybe Branch
    if (!sceneState.password) {
        sceneState.password = text;
        if (user.role === Role.SUPER_ADMIN) {
            await ctx.reply(`Password set. Please enter the Branch Name to assign the user to.`);
            return;
        } else { // Admin creating a Kassir
            const hashedPassword = await bcrypt.hash(text, 10);
            await this.prisma.user.create({
                data: {
                    telegram_id: sceneState.telegramId,
                    full_name: sceneState.fullName,
                    username: sceneState.username,
                    password: hashedPassword,
                    role: sceneState.role,
                    branch_id: user.branch_id,
                },
            });
            await ctx.reply(`Successfully created Kassir "${sceneState.fullName}".`);
            await ctx.scene.leave();
        }
        return;
    }

    // Step 6: Set Branch (for Super Admin)
    if (user.role === Role.SUPER_ADMIN && !sceneState.branchId) {
        const branch = await this.prisma.branch.findUnique({ where: { name: text } });
        if (!branch) {
            await ctx.reply('Branch not found. Please enter a valid branch name.');
            return;
        }

        const hashedPassword = await bcrypt.hash(sceneState.password, 10);
        await this.prisma.user.create({
            data: {
                telegram_id: sceneState.telegramId,
                full_name: sceneState.fullName,
                username: sceneState.username,
                password: hashedPassword,
                role: sceneState.role,
                branch_id: branch.id,
            },
        });
        await ctx.reply(`Successfully created user "${sceneState.fullName}" in branch "${branch.name}".`);
        await ctx.scene.leave();
    }
  }
}
