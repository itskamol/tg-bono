import { Scene, SceneEnter, Action, Ctx } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';

interface DeleteCategorySceneState {
    categoryId: string;
}

@Scene('delete-category-scene')
export class DeleteCategoryScene {
    constructor(private readonly prisma: PrismaService) {}

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as DeleteCategorySceneState;

        if (!sceneState.categoryId) {
            await ctx.reply('❌ Kategoriya ma\'lumotlari topilmadi.');
            await ctx.scene.leave();
            return;
        }

        const category = await this.prisma.category.findUnique({
            where: { id: sceneState.categoryId },
        });

        if (!category) {
            await ctx.reply('❌ Kategoriya topilmadi.');
            await ctx.scene.leave();
            return;
        }

        // Kategoriya ishlatilayotganligini tekshirish
        const ordersUsingThisCategory = await this.prisma.order_Product.count({
            where: { category: category.name },
        });

        let warningMessage = '';
        if (ordersUsingThisCategory > 0) {
            warningMessage = `\n⚠️ DIQQAT: Bu kategoriya ${ordersUsingThisCategory} ta buyurtmada ishlatilgan. O'chirilsa, eski buyurtmalarda "O'chirilgan kategoriya" ko'rinadi.`;
        }

        await ctx.reply(
            `🗑️ Kategoriya o'chirish\n\n📝 Nomi: ${category.name}\n😊 ${warningMessage}\n\nHaqiqatan ham bu kategoriyani o'chirmoqchimisiz?`,
            Markup.inlineKeyboard([
                Markup.button.callback('✅ Ha, o\'chirish', 'CONFIRM_DELETE_CATEGORY'),
                Markup.button.callback('❌ Yo\'q, bekor qilish', 'CANCEL_DELETE_CATEGORY'),
            ], { columns: 1 })
        );
    }

    @Action('CONFIRM_DELETE_CATEGORY')
    async onConfirmDeleteCategory(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as DeleteCategorySceneState;

        try {
            const category = await this.prisma.category.findUnique({
                where: { id: sceneState.categoryId },
            });

            if (!category) {
                await ctx.editMessageText('❌ Kategoriya topilmadi.');
                await ctx.scene.leave();
                return;
            }

            await this.prisma.category.delete({
                where: { id: sceneState.categoryId },
            });

            await ctx.editMessageText(
                `✅ Kategoriya muvaffaqiyatli o'chirildi!\n\n📝 Nomi: ${category.name}\n😊`
            );
            await ctx.scene.leave();
        } catch (error) {
            let errorMessage = '❌ Kategoriya o\'chirishda xatolik yuz berdi.';
            
            if (error instanceof Error) {
                if (error.message.includes('foreign key')) {
                    errorMessage = '❌ Bu kategoriya hali ishlatilayotgani uchun o\'chirib bo\'lmaydi.';
                }
            }

            await ctx.editMessageText(
                `${errorMessage}\n\nQaytadan urinib ko'ring yoki administratorga murojaat qiling.`,
                Markup.inlineKeyboard([
                    Markup.button.callback('🔄 Qaytadan urinish', 'CONFIRM_DELETE_CATEGORY'),
                    Markup.button.callback('❌ Bekor qilish', 'CANCEL_DELETE_CATEGORY'),
                ])
            );
        }
    }

    @Action('CANCEL_DELETE_CATEGORY')
    async onCancelDeleteCategory(@Ctx() ctx: Context) {
        await ctx.editMessageText('❌ Kategoriya o\'chirish bekor qilindi.');
        await ctx.scene.leave();
    }
}