import { Scene, SceneEnter, Action, Ctx } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';
import { safeEditMessageText } from 'src/utils/telegram.utils';

@Scene('delete-branch-scene')
export class DeleteBranchScene {
    constructor(private readonly prisma: PrismaService) { }

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as { branchId: string };

        if (!sceneState?.branchId) {
            await ctx.reply("❌ Filial ma'lumotlari topilmadi.", { parse_mode: 'HTML' });
            await ctx.scene.leave();
            return;
        }

        const branch = await this.prisma.branch.findUnique({
            where: { id: sceneState.branchId },
            include: {
                _count: {
                    select: { users: true },
                },
            },
        });

        if (!branch) {
            await ctx.reply('❌ Filial topilmadi.', { parse_mode: 'HTML' });
            await ctx.scene.leave();
            return;
        }

        await safeEditMessageText(
            ctx,
            `⚠️ Rostdan ham "<b>${branch.name}</b>" filialini o'chirmoqchimisiz?\n\n` +
            `🏪 <b>Nomi:</b> ${branch.name}\n` +
            `📍 <b>Manzil:</b> ${branch.address}\n` +
            `👥 <b>Foydalanuvchilar:</b> ${branch._count.users}\n\n` +
            `❗️ Bu amal qaytarib bo'lmaydi va barcha bog'liq foydalanuvchilar ham o'chiriladi!`,
            Markup.inlineKeyboard([
                Markup.button.callback('✅ Ha', `CONFIRM_DELETE_BRANCH_${sceneState.branchId}`),
                Markup.button.callback("❌ Yo'q", 'CANCEL_DELETE_BRANCH'),
            ]),
        );
    }

    @Action(/^CONFIRM_DELETE_BRANCH_(.+)$/)
    async onConfirmDelete(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) {
            return;
        }
        const branchData = ctx.callbackQuery.data;
        const branchId = branchData.replace('CONFIRM_DELETE_BRANCH_', '');

        try {
            const branch = await this.prisma.branch.findUnique({
                where: { id: branchId },
            });

            if (!branch) {
                await safeEditMessageText(ctx, '❌ Filial topilmadi.');
                await ctx.scene.leave();
                return;
            }

            // Delete all users in this branch first
            await this.prisma.user.deleteMany({
                where: { branch_id: branchId },
            });

            // Then delete the branch
            await this.prisma.branch.delete({
                where: { id: branchId },
            });

            await safeEditMessageText(
                ctx,
                `✅ "<b>${branch.name}</b>" filiali va unga tegishli barcha foydalanuvchilar muvaffaqiyatli o'chirildi.`,
            );
            await ctx.scene.leave();
        } catch {
            await safeEditMessageText(ctx, "❌ Filialni o'chirishda xatolik yuz berdi.");
            await ctx.scene.leave();
        }
    }

    @Action('CANCEL_DELETE_BRANCH')
    async onCancelDelete(@Ctx() ctx: Context) {
        await safeEditMessageText(ctx, "❌ O'chirish bekor qilindi.");
        await ctx.scene.leave();
    }
}
