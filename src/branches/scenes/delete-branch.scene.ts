import { Scene, SceneEnter, Action, Ctx } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';

@Scene('delete-branch-scene')
export class DeleteBranchScene {
    constructor(private readonly prisma: PrismaService) {}

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as { branchId: string };
        
        if (!sceneState?.branchId) {
            await ctx.reply("❌ Filial ma'lumotlari topilmadi.");
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
            await ctx.reply('❌ Filial topilmadi.');
            await ctx.scene.leave();
            return;
        }

        await ctx.editMessageText(
            `⚠️ Rostdan ham "${branch.name}" filialini o'chirmoqchimisiz?\n\n` +
                `🏪 Nomi: ${branch.name}\n` +
                `📍 Manzil: ${branch.address}\n` +
                `👥 Foydalanuvchilar: ${branch._count.users}\n\n` +
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
                await ctx.editMessageText('❌ Filial topilmadi.');
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

            await ctx.editMessageText(
                `✅ "${branch.name}" filiali va unga tegishli barcha foydalanuvchilar muvaffaqiyatli o'chirildi.`,
            );
            await ctx.scene.leave();
        } catch {
            await ctx.editMessageText("❌ Filialni o'chirishda xatolik yuz berdi.");
            await ctx.scene.leave();
        }
    }

    @Action('CANCEL_DELETE_BRANCH')
    async onCancelDelete(@Ctx() ctx: Context) {
        await ctx.editMessageText("❌ O'chirish bekor qilindi.");
        await ctx.scene.leave();
    }
}
