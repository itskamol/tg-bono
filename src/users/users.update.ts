import { UseGuards } from '@nestjs/common';
import { Update, Command, Ctx, Action } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { AuthGuard } from '../auth/guards/auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { Context } from '../interfaces/context.interface';
import { Role, User } from '@prisma/client';

@Update()
@UseGuards(AuthGuard)
export class UsersUpdate {
    constructor(private readonly prisma: PrismaService) {}

    @Command('list_users')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN)
    async listUsers(@Ctx() ctx: Context) {
        const user = ctx.user;
        let users: (User & { branch: { name: string } | null })[] = [];

        if (user.role === Role.SUPER_ADMIN) {
            users = await this.prisma.user.findMany({
                include: { branch: true },
            });
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
            .map((u) => `- ${u.full_name} - Role: ${u.role} - Branch: ${u.branch?.name || 'N/A'}`)
            .join('\n');

        return `Here are the users:\n${userList}`;
    }

    @Command('add_user')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN)
    async onAddUser(@Ctx() ctx: Context) {
        await ctx.scene.enter('add-user-scene');
    }

    @Command('delete_user')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN)
    async onDeleteUser(@Ctx() ctx: Context) {
        await ctx.scene.enter('delete-user-scene');
    }

    @Command('edit_user')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN)
    async onEditUser(@Ctx() ctx: Context) {
        const user = ctx.user;
        let users: User[] = [];

        if (user.role === Role.SUPER_ADMIN) {
            users = await this.prisma.user.findMany({
                where: { role: { not: Role.SUPER_ADMIN } }, // Don't show super admins
                include: { branch: true },
            });
        } else if (user.role === Role.ADMIN) {
            if (!user.branch_id) {
                await ctx.reply('❌ Siz hech qanday filialga tayinlanmagansiz.');
                return;
            }
            users = await this.prisma.user.findMany({
                where: {
                    branch_id: user.branch_id,
                    role: Role.CASHIER, // Admin can only edit cashiers
                },
                include: { branch: true },
            });
        }

        if (users.length === 0) {
            await ctx.reply('❌ Tahrirlanadigan foydalanuvchilar topilmadi.');
            return;
        }

        const userButtons = users.map((u) =>
            Markup.button.callback(`${u.full_name} (${u.role})`, `EDIT_USER_${u.id}`),
        );

        await ctx.reply(
            '✏️ Qaysi foydalanuvchini tahrirlashni xohlaysiz?',
            Markup.inlineKeyboard(userButtons, {
                columns: 2,
            }),
        );
    }

    @Action(/EDIT_USER_(.+)/)
    async onEditUserSelect(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) return;
        const userId = ctx.callbackQuery.data.split('_')[2];

        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: { branch: true },
        });

        if (!user) {
            await ctx.editMessageText('❌ Foydalanuvchi topilmadi.');
            return;
        }

        const roleText =
            {
                [Role.SUPER_ADMIN]: 'Super Admin',
                [Role.ADMIN]: 'Admin',
                [Role.CASHIER]: 'Kassir',
            }[user.role] || user.role;

        await ctx.editMessageText(
            `✏️ "${user.full_name}" foydalanuvchisini tahrirlash:\n\n` +
                `👤 To'liq ism: ${user.full_name}\n` +
                `🎭 Rol: ${roleText}\n` +
                `🏪 Filial: ${user.branch?.name || 'N/A'}\n\n` +
                `Nimani o'zgartirmoqchisiz?`,
            Markup.inlineKeyboard(
                [
                    Markup.button.callback('👤 Ism', `EDIT_NAME_${userId}`),
                    Markup.button.callback('🏪 Filial', `EDIT_BRANCH_${userId}`),
                    Markup.button.callback('❌ Bekor', 'CANCEL_EDIT'),
                ],
                {
                    columns: 2,
                },
            ),
        );
    }

    @Action('CANCEL_EDIT')
    async onCancelEdit(@Ctx() ctx: Context) {
        await ctx.editMessageText('❌ Tahrirlash bekor qilindi.');
    }

    @Action(/EDIT_NAME_(.+)/)
    async onEditName(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) return;
        const userId = ctx.callbackQuery.data.split('_')[2];
        await ctx.scene.enter('edit-name-scene', { userId });
    }

    @Action(/EDIT_BRANCH_(.+)/)
    async onEditBranch(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) return;
        const userId = ctx.callbackQuery.data.split('_')[2];

        const branches = await this.prisma.branch.findMany();
        if (branches.length === 0) {
            await ctx.editMessageText('❌ Hech qanday filial topilmadi.');
            return;
        }

        const branchButtons = branches.map((branch) =>
            Markup.button.callback(branch.name, `SET_BRANCH_${userId}_${branch.id}`),
        );

        await ctx.editMessageText(
            '🏪 Yangi filialni tanlang:',
            Markup.inlineKeyboard(branchButtons, {
                columns: 2,
            }),
        );
    }

    @Action(/SET_BRANCH_(.+)_(.+)/)
    async onSetBranch(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) return;
        const parts = ctx.callbackQuery.data.split('_');
        const userId = parts[2];
        const branchId = parts[3];

        try {
            const branch = await this.prisma.branch.findUnique({
                where: { id: branchId },
            });

            if (!branch) {
                await ctx.editMessageText('❌ Filial topilmadi.');
                return;
            }

            await this.prisma.user.update({
                where: { id: userId },
                data: { branch_id: branchId },
            });

            await ctx.editMessageText(`✅ Filial "${branch.name}" ga o'zgartirildi.`);
        } catch {
            await ctx.editMessageText("❌ Filialni o'zgartirishda xatolik yuz berdi.");
        }
    }
}
