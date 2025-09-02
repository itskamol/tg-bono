import { Scene, SceneEnter, Action, Ctx } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';
import { Role } from '@prisma/client';
import { safeEditMessageText } from '../../utils/telegram.utils';

@Scene('delete-user-scene')
export class DeleteUserScene {
    constructor(private readonly prisma: PrismaService) { }

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        const { userId } = ctx.scene.state as { userId: string };

        if (!userId) {
            await ctx.reply('❌ Foydalanuvchi ID topilmadi.');
            await ctx.scene.leave();
            return;
        }

        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: { branch: true },
        });

        if (!user) {
            await ctx.reply('❌ Foydalanuvchi topilmadi.');
            await ctx.scene.leave();
            return;
        }

        const currentUser = ctx.user;

        // Ruxsatni tekshirish
        if (currentUser.role === Role.ADMIN) {
            if (user.branch_id !== currentUser.branch_id || user.role !== Role.CASHIER) {
                await ctx.reply('❌ Bu foydalanuvchini o\'chirish huquqingiz yo\'q.');
                await ctx.scene.leave();
                return;
            }
        }

        const roleText = {
            [Role.SUPER_ADMIN]: 'Super Admin',
            [Role.ADMIN]: 'Admin',
            [Role.CASHIER]: 'Kassir',
        }[user.role] || user.role;

        await safeEditMessageText(
            ctx,
            `⚠️ Rostdan ham "${user.full_name}" foydalanuvchisini o'chirmoqchimisiz?\n\n` +
            `👤 To'liq ism: ${user.full_name}\n` +
            `�  Rol: ${roleText}\n` +
            `🏪 Filial: ${user.branch?.name || 'N/A'}`,
            Markup.inlineKeyboard([
                Markup.button.callback('✅ Ha', `CONFIRM_DELETE_${userId}`),
                Markup.button.callback("❌ Yo'q", 'CANCEL_DELETE'),
            ]),
            'O\'chirish tasdiqi'
        );
    }



    @Action(/CONFIRM_DELETE_(.+)/)
    async onConfirmDelete(@Ctx() ctx: Context) {
        const userData = (ctx.callbackQuery as any).data;
        const userId = userData.split('_')[2];

        try {
            const user = await this.prisma.user.findUnique({
                where: { id: userId },
            });

            if (!user) {
                await safeEditMessageText(ctx, '❌ Foydalanuvchi topilmadi.', undefined, 'Xatolik');
                await ctx.scene.leave();
                return;
            }

            await this.prisma.user.delete({
                where: { id: userId },
            });

            await safeEditMessageText(
                ctx,
                `✅ "${user.full_name}" foydalanuvchisi muvaffaqiyatli o'chirildi.`,
                undefined,
                'Muvaffaqiyatli o\'chirildi'
            );
            await ctx.scene.leave();
        } catch (error) {
            await safeEditMessageText(
                ctx,
                "❌ Foydalanuvchini o'chirishda xatolik yuz berdi.",
                undefined,
                'Xatolik'
            );
            await ctx.scene.leave();
        }
    }

    @Action('CANCEL_DELETE')
    async onCancelDelete(@Ctx() ctx: Context) {
        await safeEditMessageText(ctx, "❌ O'chirish bekor qilindi.", undefined, 'Bekor qilindi');
        await ctx.scene.leave();
    }
}
