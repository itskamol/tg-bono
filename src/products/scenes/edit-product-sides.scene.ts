import { Scene, SceneEnter, On, Message, Action, Ctx } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';

@Scene('edit-product-sides-scene')
export class EditProductSidesScene {
    constructor(private readonly prisma: PrismaService) {}

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as any;
        const product = await this.prisma.product.findUnique({
            where: { id: sceneState.productId },
        });

        if (!product) {
            await ctx.reply('❌ Mahsulot topilmadi.');
            await ctx.scene.leave();
            return;
        }

        await ctx.reply(
            `🍕 Hozirgi tomonlar: ${product.sides.join(', ')}\n\nYangi tomonlarni vergul bilan ajratib kiriting (masalan: oldi, orqa):`,
            Markup.inlineKeyboard([
                Markup.button.callback("❌ Tomonlar yo'q", 'NO_SIDES'),
                Markup.button.callback('🔙 Bekor qilish', 'CANCEL_EDIT_SIDES'),
            ]),
        );
    }

    @On('text')
    async onText(@Ctx() ctx: Context, @Message('text') text: string) {
        const sceneState = ctx.scene.state as any;

        const sides = text
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
        if (sides.length === 0) {
            await ctx.reply(
                '❌ Kamida bitta tomon kiriting yoki "Tomonlar yo\'q" tugmasini bosing.',
            );
            return;
        }

        try {
            await this.prisma.product.update({
                where: { id: sceneState.productId },
                data: { sides: sides },
            });

            await ctx.reply(`✅ Mahsulot tomonlari "${sides.join(', ')}" ga o'zgartirildi.`);
            await ctx.scene.leave();
        } catch (error) {
            await ctx.reply("❌ Mahsulot tomonlarini o'zgartirishda xatolik yuz berdi.");
            await ctx.scene.leave();
        }
    }

    @Action('NO_SIDES')
    async onNoSides(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as any;

        try {
            await this.prisma.product.update({
                where: { id: sceneState.productId },
                data: { sides: ['N/A'] },
            });

            await ctx.editMessageText('✅ Mahsulot tomonlari "yo\'q" ga o\'zgartirildi.');
            await ctx.scene.leave();
        } catch (error) {
            await ctx.editMessageText("❌ Mahsulot tomonlarini o'zgartirishda xatolik yuz berdi.");
            await ctx.scene.leave();
        }
    }

    @Action('CANCEL_EDIT_SIDES')
    async onCancelEdit(@Ctx() ctx: Context) {
        await ctx.editMessageText('❌ Tahrirlash bekor qilindi.');
        await ctx.scene.leave();
    }
}
