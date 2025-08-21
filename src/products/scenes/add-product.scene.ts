import { Scene, SceneEnter, On, Message, Ctx } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';

@Scene('add-product-scene')
export class AddProductScene {
    constructor(private readonly prisma: PrismaService) {}

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        await ctx.reply(
            "📦 Yangi mahsulot qo'shish\n\nMahsulot turini kiriting (masalan: pizza, burger, drink):",
            Markup.inlineKeyboard([
                Markup.button.callback('❌ Bekor qilish', 'CANCEL_ADD_PRODUCT'),
            ]),
        );
    }

    @On('text')
    async onText(@Ctx() ctx: Context, @Message('text') text: string) {
        const sceneState = ctx.scene.state as any;

        // Step 1: Set Type
        if (!sceneState.type) {
            sceneState.type = text.toLowerCase().trim();
            await ctx.reply(
                `✅ Turi: ${text}\n\n📝 Mahsulot nomini kiriting:`,
                Markup.inlineKeyboard([
                    Markup.button.callback('❌ Bekor qilish', 'CANCEL_ADD_PRODUCT'),
                ]),
            );
            return;
        }

        // Step 2: Set Name
        if (!sceneState.name) {
            // Check if product name already exists
            const existingProduct = await this.prisma.product.findFirst({
                where: {
                    name: text.trim(),
                    type: sceneState.type,
                },
            });

            if (existingProduct) {
                await ctx.reply('❌ Bu nom bilan mahsulot allaqachon mavjud. Boshqa nom kiriting:');
                return;
            }

            sceneState.name = text.trim();
            await ctx.reply(
                `✅ Nomi: ${text}\n\n🍕 Mavjud tomonlarni vergul bilan ajratib kiriting (masalan: oldi, orqa):`,
                Markup.inlineKeyboard([
                    Markup.button.callback("⏭️ Tomonlar yo'q", 'NO_SIDES'),
                    Markup.button.callback('❌ Bekor qilish', 'CANCEL_ADD_PRODUCT'),
                ]),
            );
            return;
        }

        // Step 3: Set Sides
        if (!sceneState.sides) {
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

            sceneState.sides = sides;
            await ctx.reply(
                `✅ Tomonlar: ${sides.join(', ')}\n\n💰 Narxini kiriting (so'mda):`,
                Markup.inlineKeyboard([
                    Markup.button.callback('❌ Bekor qilish', 'CANCEL_ADD_PRODUCT'),
                ]),
            );
            return;
        }

        // Step 4: Set Price and Save
        if (!sceneState.price) {
            const price = parseFloat(text);
            if (isNaN(price) || price <= 0) {
                await ctx.reply("❌ Noto'g'ri narx. Musbat son kiriting:");
                return;
            }

            sceneState.price = price;

            try {
                const product = await this.prisma.product.create({
                    data: {
                        type: sceneState.type,
                        name: sceneState.name,
                        sides: sceneState.sides,
                        price: sceneState.price,
                    },
                });

                await ctx.reply(
                    `✅ Mahsulot muvaffaqiyatli yaratildi!\n\n` +
                        `📦 Turi: ${product.type}\n` +
                        `📝 Nomi: ${product.name}\n` +
                        `🍕 Tomonlar: ${product.sides.join(', ')}\n` +
                        `💰 Narxi: ${product.price} so'm`,
                );
                await ctx.scene.leave();
            } catch (error) {
                await ctx.reply('❌ Mahsulot yaratishda xatolik yuz berdi.');
                await ctx.scene.leave();
            }
        }
    }

    @On('callback_query')
    async onCallbackQuery(@Ctx() ctx: Context) {
        const data = (ctx.callbackQuery as any).data;

        if (data === 'NO_SIDES') {
            const sceneState = ctx.scene.state as any;
            sceneState.sides = ['N/A'];

            await ctx.editMessageText(`✅ Tomonlar: yo'q\n\n💰 Narxini kiriting (so'mda):`);
        } else if (data === 'CANCEL_ADD_PRODUCT') {
            await ctx.editMessageText("❌ Mahsulot qo'shish bekor qilindi.");
            await ctx.scene.leave();
        }
    }
}
