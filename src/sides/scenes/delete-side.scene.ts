import { Scene, SceneEnter, Action, Ctx } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';
import { formatCurrency } from 'src/utils/format.utils';
import { safeEditMessageText, safeReplyOrEdit } from 'src/utils/telegram.utils';

interface DeleteSideSceneState {
    sideId: string;
}

@Scene('delete-side-scene')
export class DeleteSideScene {
    constructor(private readonly prisma: PrismaService) { }

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as DeleteSideSceneState;

        if (!sceneState.sideId) {
            await safeReplyOrEdit(ctx, "❌ Tomon ma'lumotlari topilmadi.");
            await ctx.scene.leave();
            return;
        }

        const side = await this.prisma.side.findUnique({
            where: { id: sceneState.sideId },
        });

        if (!side) {
            await safeReplyOrEdit(ctx, '❌ Tomon topilmadi.');
            await ctx.scene.leave();
            return;
        }

        const ordersUsingThisSide = await this.prisma.order_Product.count({
            where: { side_name: side.name },
        });

        let warningMessage = '';
        if (ordersUsingThisSide > 0) {
            warningMessage = `\n⚠️ <b>DIQQAT:</b> Bu tomon <b>${ordersUsingThisSide}</b> ta buyurtmada ishlatilgan. O'chirilsa, eski buyurtmalarda "O'chirilgan tomon" ko'rinadi.`;
        }

        await safeReplyOrEdit(
            ctx,
            `🗑️ <b>Tomon o'chirish</b>\n\n📝 <b>Nomi:</b> ${side.name}\n💰 <b>Narxi:</b> ${formatCurrency(side.price)} ${warningMessage}\n\nHaqiqatan ham bu tomonni o'chirmoqchimisiz?`,
            Markup.inlineKeyboard(
                [
                    Markup.button.callback("✅ Ha, o'chirish", 'CONFIRM_DELETE_SIDE'),
                    Markup.button.callback("❌ Yo'q, bekor qilish", 'CANCEL_DELETE_SIDE'),
                ],
                { columns: 1 },
            ),
        );
    }

    @Action('CONFIRM_DELETE_SIDE')
    async onConfirmDeleteSide(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as DeleteSideSceneState;

        try {
            const side = await this.prisma.side.findUnique({
                where: { id: sceneState.sideId },
            });

            if (!side) {
                await safeEditMessageText(ctx, '❌ Tomon topilmadi.');
                await ctx.scene.leave();
                return;
            }

            await this.prisma.side.delete({
                where: { id: sceneState.sideId },
            });

            await safeEditMessageText(
                ctx,
                `✅ <b>Tomon muvaffaqiyatli o'chirildi!</b>\n\n📝 <b>O'chirilgan tomon:</b> ${side.name}\n💰 <b>Narxi:</b> ${formatCurrency(side.price)}`,
            );
            await ctx.scene.leave();
        } catch (error) {
            let errorMessage = "❌ Tomon o'chirishda xatolik yuz berdi.";

            if (error instanceof Error) {
                if (error.message.includes('foreign key') || error.message.includes('constraint')) {
                    errorMessage =
                        "❌ Bu tomon boshqa ma'lumotlarda ishlatilgani uchun o'chirib bo'lmaydi.";
                }
            }

            await safeEditMessageText(
                ctx,
                `${errorMessage}\n\nQaytadan urinib ko'ring yoki administratorga murojaat qiling.`,
                Markup.inlineKeyboard([
                    Markup.button.callback('🔄 Qaytadan urinish', 'CONFIRM_DELETE_SIDE'),
                    Markup.button.callback('❌ Bekor qilish', 'CANCEL_DELETE_SIDE'),
                ]),
            );
        }
    }

    @Action('CANCEL_DELETE_SIDE')
    async onCancelDeleteSide(@Ctx() ctx: Context) {
        await safeEditMessageText(ctx, "❌ Tomon o'chirish bekor qilindi.");
        await ctx.scene.leave();
    }
}
