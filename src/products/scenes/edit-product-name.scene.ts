import { Scene, SceneEnter, On, Message, Ctx } from 'nestjs-telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';

interface EditProductSceneState {
    productId: string;
}

@Scene('edit-product-name-scene')
export class EditProductNameScene {
    constructor(private readonly prisma: PrismaService) {}

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as EditProductSceneState;
        const product = await this.prisma.product.findUnique({
            where: { id: sceneState.productId },
        });

        if (!product) {
            await ctx.reply('❌ Mahsulot topilmadi.');
            await ctx.scene.leave();
            return;
        }

        await ctx.reply(`📝 Hozirgi nom: ${product.name}\n\nYangi mahsulot nomini kiriting:`);
    }

    @On('text')
    async onText(@Ctx() ctx: Context, @Message('text') text: string) {
        const sceneState = ctx.scene.state as EditProductSceneState;

        // Check if product name already exists
        const existingProduct = await this.prisma.product.findFirst({
            where: {
                name: text.trim(),
                id: { not: sceneState.productId },
            },
        });

        if (existingProduct) {
            await ctx.reply('❌ Bu nom bilan mahsulot allaqachon mavjud. Boshqa nom kiriting:');
            return;
        }

        try {
            await this.prisma.product.update({
                where: { id: sceneState.productId },
                data: { name: text.trim() },
            });

            await ctx.reply(`✅ Mahsulot nomi "${text}" ga o'zgartirildi.`);
            await ctx.scene.leave();
        } catch {
            await ctx.reply("❌ Mahsulot nomini o'zgartirishda xatolik yuz berdi.");
            await ctx.scene.leave();
        }
    }
}
