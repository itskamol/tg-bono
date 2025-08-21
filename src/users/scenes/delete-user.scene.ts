import { Scene, SceneEnter, Action, Ctx } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';
import { Role, User } from '@prisma/client';

@Scene('delete-user-scene')
export class DeleteUserScene {
    constructor(private readonly prisma: PrismaService) {}

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        const telegramId = ctx.from?.id;
        if (!telegramId) {
            await ctx.reply('❌ Telegram ID topilmadi.');
            await ctx.scene.leave();
            return;
        }

        const currentUser = await this.prisma.user.findUnique({
            where: { telegram_id: telegramId },
        });

        if (!currentUser) {
            await ctx.reply("❌ Siz tizimda ro'yxatdan o'tmagansiz.");
            await ctx.scene.leave();
            return;
        }

        let users: User[] = [];

        if (currentUser.role === Role.SUPER_ADMIN) {
            users = await this.prisma.user.findMany({
                where: { role: { not: Role.SUPER_ADMIN } }, // Don't show super admins
            });
        } else if (currentUser.role === Role.ADMIN) {
            if (!currentUser.branch_id) {
                await ctx.reply('❌ Siz hech qanday filialga tayinlanmagansiz.');
                await ctx.scene.leave();
                return;
            }
            users = await this.prisma.user.findMany({
                where: {
                    branch_id: currentUser.branch_id,
                    role: Role.CASHIER, // Admin can only delete cashiers
                },
            });
        }

        if (users.length === 0) {
            await ctx.reply("❌ O'chiriladigan foydalanuvchilar topilmadi.");
            await ctx.scene.leave();
            return;
        }

        const userButtons = users.map((u) =>
            Markup.button.callback(`${u.full_name} (${u.role})`, `DELETE_USER_${u.id}`),
        );

        await ctx.reply(
            "🗑️ Qaysi foydalanuvchini o'chirmoqchisiz?",
            Markup.inlineKeyboard(
                [...userButtons, Markup.button.callback('❌ Bekor qilish', 'CANCEL_DELETE')],
                {
                    columns: 2,
                },
            ),
        );
    }

    @Action(/DELETE_USER_(.+)/)
    async onDeleteUserConfirm(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) return;
        const userId = ctx.callbackQuery.data.replace('DELETE_USER_', '');

        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: { branch: true },
        });

        if (!user) {
            await ctx.editMessageText('❌ Foydalanuvchi topilmadi.');
            await ctx.scene.leave();
            return;
        }

        const roleText =
            {
                [Role.SUPER_ADMIN]: 'Super Admin',
                [Role.ADMIN]: 'Admin',
                [Role.CASHIER]: 'Kassir',
            }[user.role] || user.role;

        await ctx.editMessageText(
            `⚠️ Rostdan ham "${user.full_name}" foydalanuvchisini o'chirmoqchimisiz?\n\n` +
                `👤 To'liq ism: ${user.full_name}\n` +
                `🎭 Rol: ${roleText}\n` +
                `🏪 Filial: ${user.branch?.name || 'N/A'}`,
            Markup.inlineKeyboard([
                Markup.button.callback('✅ Ha', `CONFIRM_DELETE_${userId}`),
                Markup.button.callback("❌ Yo'q", 'CANCEL_DELETE'),
            ]),
        );
    }

    @Action(/CONFIRM_DELETE_(.+)/)
    async onConfirmDelete(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) return;
        const userId = ctx.callbackQuery.data.replace('CONFIRM_DELETE_', '');

        try {
            const user = await this.prisma.user.findUnique({
                where: { id: userId },
            });

            if (!user) {
                await ctx.editMessageText('❌ Foydalanuvchi topilmadi.');
                await ctx.scene.leave();
                return;
            }

            await this.prisma.user.delete({
                where: { id: userId },
            });

            await ctx.editMessageText(
                `✅ "${user.full_name}" foydalanuvchisi muvaffaqiyatli o'chirildi.`,
            );
            await ctx.scene.leave();
        } catch {
            await ctx.editMessageText("❌ Foydalanuvchini o'chirishda xatolik yuz berdi.");
            await ctx.scene.leave();
        }
    }

    @Action('CANCEL_DELETE')
    async onCancelDelete(@Ctx() ctx: Context) {
        await ctx.editMessageText("❌ O'chirish bekor qilindi.");
        await ctx.scene.leave();
    }
}
