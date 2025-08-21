import { Scene, SceneEnter, On, Message, Ctx } from 'nestjs-telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';

@Scene('edit-product-price-scene')
export class EditProductPriceScene {
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
            `💰 Hozirgi narx: ${product.price} so'm\n\nYangi narxni kiriting (so'mda):`,
        );
    }

    @On('text')
    async onText(@Ctx() ctx: Context, @Message('text') text: string) {
        const sceneState = ctx.scene.state as any;

        const price = parseFloat(text);
        if (isNaN(price) || price <= 0) {
            await ctx.reply("❌ Noto'g'ri narx. Musbat son kiriting:");
            return;
        }

        try {
            await this.prisma.product.update({
                where: { id: sceneState.productId },
                data: { price: price },
            });

            await ctx.reply(`✅ Mahsulot narxi ${price} so'm ga o'zgartirildi.`);
            await ctx.scene.leave();
        } catch (error) {
            await ctx.reply("❌ Mahsulot narxini o'zgartirishda xatolik yuz berdi.");
            await ctx.scene.leave();
        }
    }
}
