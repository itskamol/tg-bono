import { Scene, SceneEnter, On, Message, Ctx } from 'nestjs-telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';

@Scene('edit-product-type-scene')
export class EditProductTypeScene {
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
            `📦 Hozirgi turi: ${product.type}\n\nYangi mahsulot turini kiriting (masalan: pizza, burger, drink):`,
        );
    }

    @On('text')
    async onText(@Ctx() ctx: Context, @Message('text') text: string) {
        const sceneState = ctx.scene.state as any;

        try {
            await this.prisma.product.update({
                where: { id: sceneState.productId },
                data: { type: text.toLowerCase().trim() },
            });

            await ctx.reply(`✅ Mahsulot turi "${text}" ga o'zgartirildi.`);
            await ctx.scene.leave();
        } catch (error) {
            await ctx.reply("❌ Mahsulot turini o'zgartirishda xatolik yuz berdi.");
            await ctx.scene.leave();
        }
    }
}
