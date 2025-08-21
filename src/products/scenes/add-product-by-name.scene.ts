import { Scene, SceneEnter, On, Message, Ctx } from 'nestjs-telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';

interface AddProductByNameSceneState {
    type: string;
    name?: string;
    price?: number;
}

@Scene('add-product-by-name-scene')
export class AddProductByNameScene {
    constructor(private readonly prisma: PrismaService) {}

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        await ctx.reply('🆕 Yangi mahsulot nomini kiriting:');
    }

    @On('text')
    async onText(@Ctx() ctx: Context, @Message('text') text: string) {
        const sceneState = ctx.scene.state as AddProductByNameSceneState;

        if (!sceneState.name) {
            sceneState.name = text;
            await ctx.reply(`💰 Narxini kiriting:`);
            return;
        }

        if (!sceneState.price) {
            const price = parseInt(text, 10);
            if (isNaN(price) || price <= 0) {
                await ctx.reply("❌ Noto'g'ri narx. Musbat son kiriting:");
                return;
            }
            sceneState.price = price;

            const newProduct = await this.prisma.product.create({
                data: {
                    name: sceneState.name,
                    price: sceneState.price,
                    type: sceneState.type,
                },
            });

            await ctx.reply(`✅ Yangi mahsulot "${newProduct.name}" yaratildi.`);
            await ctx.scene.leave({ createdProduct: newProduct });
        }
    }
}
