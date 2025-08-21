import { Scene, SceneEnter, Action, Ctx } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';

@Scene('delete-product-scene')
export class DeleteProductScene {
    constructor(private readonly prisma: PrismaService) {}

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        const products = await this.prisma.product.findMany({
            orderBy: [{ type: 'asc' }, { name: 'asc' }],
        });

        if (products.length === 0) {
            await ctx.reply("❌ O'chiriladigan mahsulotlar topilmadi.");
            await ctx.scene.leave();
            return;
        }

        const productButtons = products.map((product) =>
            Markup.button.callback(
                `${this.getTypeEmoji(product.type)} ${product.name} - ${product.price} so'm`,
                `DELETE_PRODUCT_${product.id}`,
            ),
        );

        await ctx.reply(
            "🗑️ Qaysi mahsulotni o'chirmoqchisiz?\n\n⚠️ Diqqat: Mahsulot o'chirilganda unga bog'liq buyurtmalar ham ta'sirlanishi mumkin!",
            Markup.inlineKeyboard([
                ...productButtons,
                Markup.button.callback('❌ Bekor qilish', 'CANCEL_DELETE_PRODUCT'),
            ]),
        );
    }

    @Action(/^DELETE_PRODUCT_(.+)$/)
    async onDeleteProductConfirm(@Ctx() ctx: Context) {
        const productData = (ctx.callbackQuery as any).data;
        const productId = productData.replace('DELETE_PRODUCT_', '');

        const product = await this.prisma.product.findUnique({
            where: { id: productId },
            include: {
                _count: {
                    select: { order_products: true },
                },
            },
        });

        if (!product) {
            await ctx.editMessageText('❌ Mahsulot topilmadi.');
            await ctx.scene.leave();
            return;
        }

        await ctx.editMessageText(
            `⚠️ Rostdan ham "${product.name}" mahsulotini o'chirmoqchimisiz?\n\n` +
                `📦 Turi: ${product.type}\n` +
                `📝 Nomi: ${product.name}\n` +
                `🍕 Tomonlar: ${product.sides.join(', ')}\n` +
                `💰 Narxi: ${product.price} so'm\n` +
                `📊 Buyurtmalarda ishlatilgan: ${product._count.order_products} marta\n\n` +
                `❗️ Bu amal qaytarib bo'lmaydi!`,
            Markup.inlineKeyboard([
                Markup.button.callback('✅ Ha', `CONFIRM_DELETE_PRODUCT_${productId}`),
                Markup.button.callback("❌ Yo'q", 'CANCEL_DELETE_PRODUCT'),
            ]),
        );
    }

    @Action(/^CONFIRM_DELETE_PRODUCT_(.+)$/)
    async onConfirmDelete(@Ctx() ctx: Context) {
        const productData = (ctx.callbackQuery as any).data;
        const productId = productData.replace('CONFIRM_DELETE_PRODUCT_', '');

        try {
            const product = await this.prisma.product.findUnique({
                where: { id: productId },
            });

            if (!product) {
                await ctx.editMessageText('❌ Mahsulot topilmadi.');
                await ctx.scene.leave();
                return;
            }

            await this.prisma.product.delete({
                where: { id: productId },
            });

            await ctx.editMessageText(`✅ "${product.name}" mahsuloti muvaffaqiyatli o'chirildi.`);
            await ctx.scene.leave();
        } catch (error) {
            await ctx.editMessageText(
                "❌ Mahsulotni o'chirishda xatolik yuz berdi. Bu mahsulot buyurtmalarda ishlatilgan bo'lishi mumkin.",
            );
            await ctx.scene.leave();
        }
    }

    @Action('CANCEL_DELETE_PRODUCT')
    async onCancelDelete(@Ctx() ctx: Context) {
        await ctx.editMessageText("❌ O'chirish bekor qilindi.");
        await ctx.scene.leave();
    }

    private getTypeEmoji(type: string): string {
        const emojis = {
            pizza: '🍕',
            burger: '🍔',
            drink: '🥤',
            dessert: '🍰',
            salad: '🥗',
        };
        return emojis[type.toLowerCase()] || '📦';
    }
}
