import { Scene, SceneEnter, On, Message, Action, Ctx } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';
import { PaymentType } from '@prisma/client';

interface NewOrderSceneState {
    products: any[];
    currentProduct: any;
    newProduct?: any;
    clientName?: string;
    clientPhone?: string | null;
    clientBirthday?: Date | null;
    birthdaySkipped?: boolean;
    awaitingNewProductName?: boolean;
    awaitingNewProductPrice?: boolean;
    totalAmount?: number;
    paymentType?: PaymentType;
}

@Scene('new-order-scene')
export class NewOrderScene {
    constructor(private readonly prisma: PrismaService) {}

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as NewOrderSceneState;
        sceneState.products = [];
        sceneState.currentProduct = {};

        await ctx.reply(
            '🛒 Yangi buyurtma yaratish\n\n👤 Mijozning ismini kiriting:',
            Markup.inlineKeyboard([Markup.button.callback('❌ Bekor qilish', 'CANCEL_ORDER')]),
        );
    }

    @On('text')
    async onText(@Ctx() ctx: Context, @Message('text') text: string) {
        const sceneState = ctx.scene.state as NewOrderSceneState;

        // Step 1: Client Name
        if (!sceneState.clientName) {
            sceneState.clientName = text;
            await ctx.reply(
                `✅ Mijoz ismi: ${text}\n\n📞 Mijozning telefon raqamini kiriting:`,
                Markup.inlineKeyboard([
                    Markup.button.callback("⏭️ O'tkazib yuborish", 'SKIP_PHONE'),
                    Markup.button.callback('❌ Bekor qilish', 'CANCEL_ORDER'),
                ]),
            );
            return;
        }

        // Step 2: Client Phone
        if (!sceneState.clientPhone) {
            // Basic phone validation
            if (!/^[+]?[0-9\s-()]{9,}$/.test(text)) {
                await ctx.reply("❌ Noto'g'ri telefon raqam formati. Qaytadan kiriting:");
                return;
            }
            sceneState.clientPhone = text;
            await ctx.reply(
                `✅ Telefon: ${text}\n\n🎂 Mijozning tug'ilgan kunini kiriting (YYYY-MM-DD):`,
                Markup.inlineKeyboard([
                    Markup.button.callback("⏭️ O'tkazib yuborish", 'SKIP_BIRTHDAY'),
                    Markup.button.callback('❌ Bekor qilish', 'CANCEL_ORDER'),
                ]),
            );
            return;
        }

        // Step 3: Client Birthday
        if (!sceneState.clientBirthday && !sceneState.birthdaySkipped) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
                await ctx.reply(
                    "❌ Noto'g'ri sana formati. YYYY-MM-DD formatida kiriting (masalan: 1990-05-15):",
                );
                return;
            }

            const birthday = new Date(text);
            if (isNaN(birthday.getTime()) || birthday > new Date()) {
                await ctx.reply("❌ Noto'g'ri sana. Qaytadan kiriting:");
                return;
            }

            sceneState.clientBirthday = birthday;
            await ctx.reply(`✅ Tug'ilgan kun: ${text}\n\n📦 Endi mahsulot qo'shamiz.`);
            return this.showProductTypes(ctx);
        }

        // Step 4: New product name
        if (sceneState.awaitingNewProductName) {
            sceneState.newProduct.name = text;
            sceneState.awaitingNewProductName = false;
            sceneState.awaitingNewProductPrice = true;
            await ctx.reply(`💰 Narxini kiriting:`);
            return;
        }

        // Step 5: New product price
        if (sceneState.awaitingNewProductPrice) {
            const price = parseInt(text, 10);
            if (isNaN(price) || price <= 0) {
                await ctx.reply("❌ Noto'g'ri narx. Musbat son kiriting:");
                return;
            }
            sceneState.newProduct.price = price;
            sceneState.awaitingNewProductPrice = false;

            const newProduct = await this.prisma.product.create({
                data: {
                    name: sceneState.newProduct.name,
                    price: sceneState.newProduct.price,
                    type: sceneState.newProduct.type,
                },
            });

            sceneState.currentProduct.productId = newProduct.id;
            sceneState.currentProduct.productId = newProduct.id;
            sceneState.currentProduct.name = newProduct.name;
            sceneState.currentProduct.price = newProduct.price;
            sceneState.currentProduct.side = 'N/A'; // Assuming new products don't have sides for now
            sceneState.currentProduct.quantity = 1; // Default quantity

            // Add to products list and show summary
            sceneState.products.push({ ...sceneState.currentProduct });
            sceneState.currentProduct = {};
            await this.showOrderSummary(ctx);
        }
    }

    async showOrderSummary(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as NewOrderSceneState;
        const total = sceneState.products.reduce((sum, p) => sum + p.price * p.quantity, 0);
        const productsList = sceneState.products
            .map(
                (p, i) =>
                    `${i + 1}. ${p.quantity}x ${p.name} (${p.side}) - ${p.price * p.quantity} so'm`,
            )
            .join('\n');

        await ctx.reply(
            `✅ Mahsulot qo'shildi!\n\n📦 Joriy mahsulotlar:\n${productsList}\n\n💰 Jami: ${total} so'm\n\nYana mahsulot qo'shasizmi?`,
            Markup.inlineKeyboard(
                [
                    Markup.button.callback('➕ Yana', 'ADD_PRODUCT'),
                    Markup.button.callback("💳 To'lov", 'PAYMENT'),
                    Markup.button.callback('❌ Bekor qilish', 'CANCEL_ORDER'),
                ],
                {
                    columns: 2,
                },
            ),
        );
    }

    @Action('SKIP_PHONE')
    async onSkipPhone(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as NewOrderSceneState;
        sceneState.clientPhone = null;
        await ctx.reply(
            `⏭️ Telefon raqami o'tkazib yuborildi.\n\n🎂 Mijozning tug'ilgan kunini kiriting (YYYY-MM-DD):`,
            Markup.inlineKeyboard([
                Markup.button.callback("⏭️ O'tkazib yuborish", 'SKIP_BIRTHDAY'),
                Markup.button.callback('❌ Bekor qilish', 'CANCEL_ORDER'),
            ]),
        );
    }

    @Action('SKIP_BIRTHDAY')
    async onSkipBirthday(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as NewOrderSceneState;
        sceneState.birthdaySkipped = true;
        sceneState.clientBirthday = null;

        await ctx.editMessageText(
            "⏭️ Tug'ilgan kun o'tkazib yuborildi.\n\n📦 Endi mahsulot qo'shamiz.",
        );
        return this.showProductTypes(ctx);
    }

    async showProductTypes(ctx: Context) {
        const productTypes = await this.prisma.product.findMany({
            distinct: ['type'],
            select: { type: true },
        });

        if (productTypes.length === 0) {
            await ctx.reply('❌ Hozirda buyurtma berish uchun mahsulotlar mavjud emas.');
            return ctx.scene.leave();
        }

        const typeButtons = productTypes.map((pt) =>
            Markup.button.callback(
                this.getTypeEmoji(pt.type) + ' ' + this.capitalizeFirst(pt.type),
                `TYPE_${pt.type}`,
            ),
        );

        await ctx.reply(
            '📦 Mahsulot turini tanlang:',
            Markup.inlineKeyboard(
                [...typeButtons, Markup.button.callback('❌ Bekor qilish', 'CANCEL_ORDER')],
                {
                    columns: 2, // Har bir qatordagi tugmalar soni. 2 yoki 3 qilib o'zgartirishingiz mumkin.
                },
            ),
        );
    }

    @Action(/^TYPE_(.+)$/)
    async onProductType(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) {
            return;
        }
        const type = ctx.callbackQuery.data.replace('TYPE_', '');
        const sceneState = ctx.scene.state as NewOrderSceneState;
        sceneState.currentProduct.type = type;

        const products = await this.prisma.product.findMany({
            where: { type },
            orderBy: { name: 'asc' },
        });

        const productButtons = products.map((p) =>
            Markup.button.callback(`${p.name} - ${p.price} so'm`, `PRODUCT_${p.id}`),
        );

        await ctx.editMessageText(
            `${this.getTypeEmoji(type)} "${this.capitalizeFirst(
                type,
            )}" tanlandi.\n\n📋 Mahsulotni tanlang:`,
            Markup.inlineKeyboard(
                [
                    ...productButtons,
                    Markup.button.callback('➕ Yangi mahsulot', `CREATE_PRODUCT_${type}`),
                    Markup.button.callback('🔙 Orqaga', 'BACK_TO_TYPES'),
                    Markup.button.callback('❌ Bekor qilish', 'CANCEL_ORDER'),
                ],
                {
                    columns: 2,
                },
            ),
        );
    }

    @Action(/^CREATE_PRODUCT_(.+)$/)
    async onCreateProduct(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) {
            return;
        }
        const type = ctx.callbackQuery.data.replace('CREATE_PRODUCT_', '');
        const sceneState = ctx.scene.state as NewOrderSceneState;
        sceneState.newProduct = { type };
        await ctx.editMessageText(`🆕 Yangi mahsulot nomini kiriting:`);
        sceneState.awaitingNewProductName = true;
    }

    @Action(/^PRODUCT_(.+)$/)
    async onProduct(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) {
            return;
        }
        const productId = ctx.callbackQuery.data.replace('PRODUCT_', '');
        const sceneState = ctx.scene.state as NewOrderSceneState;

        const product = await this.prisma.product.findUnique({
            where: { id: productId },
        });

        if (!product) {
            await ctx.editMessageText('❌ Mahsulot topilmadi.');
            return;
        }

        sceneState.currentProduct.productId = product.id;
        sceneState.currentProduct.name = product.name;
        sceneState.currentProduct.price = product.price;

        if (product.sides && product.sides.length > 0) {
            const sideButtons = product.sides.map((side) =>
                Markup.button.callback(
                    this.getSideEmoji(side) + ' ' + this.capitalizeFirst(side),
                    `SIDE_${side}`,
                ),
            );

            await ctx.editMessageText(
                `📦 "${product.name}" tanlandi (${product.price} so'm)\n\n🍕 Tomonni tanlang:`,
                Markup.inlineKeyboard(
                    [
                        ...sideButtons,
                        Markup.button.callback(
                            '🔙 Orqaga',
                            `TYPE_${sceneState.currentProduct.type}`,
                        ),
                        Markup.button.callback('❌ Bekor qilish', 'CANCEL_ORDER'),
                    ],
                    {
                        columns: 2, // Har bir qatordagi tugmalar soni. 2 yoki 3 qilib o'zgartirishingiz mumkin.
                    },
                ),
            );
        } else {
            // Product has no sides, add with quantity 1 and show summary
            sceneState.currentProduct.side = 'N/A';
            sceneState.currentProduct.quantity = 1;
            sceneState.products.push({ ...sceneState.currentProduct });
            sceneState.currentProduct = {};
            await ctx.editMessageText(`✅ "${product.name}" qo'shildi.`);
            await this.showOrderSummary(ctx);
        }
    }

    @Action(/^SIDE_(.+)$/)
    async onSide(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) {
            return;
        }
        const side = ctx.callbackQuery.data.replace('SIDE_', '');
        const sceneState = ctx.scene.state as NewOrderSceneState;
        sceneState.currentProduct.side = side;
        sceneState.currentProduct.quantity = 1;
        sceneState.products.push({ ...sceneState.currentProduct });
        await ctx.editMessageText(
            `✅ "${sceneState.currentProduct.name}" (${this.capitalizeFirst(
                side,
            )}) qo'shildi.`,
        );
        sceneState.currentProduct = {};
        await this.showOrderSummary(ctx);
    }

    @Action('BACK_TO_TYPES')
    async onBackToTypes(@Ctx() ctx: Context) {
        return this.showProductTypes(ctx);
    }

    @Action('ADD_PRODUCT')
    async onAddAnotherProduct(@Ctx() ctx: Context) {
        await ctx.editMessageText("➕ Yana mahsulot qo'shish...");
        return this.showProductTypes(ctx);
    }

    @Action('PAYMENT')
    async onPayment(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as NewOrderSceneState;

        if (!sceneState.products || sceneState.products.length === 0) {
            await ctx.editMessageText("❌ Buyurtmada mahsulot yo'q. Avval mahsulot qo'shing.");
            return this.showProductTypes(ctx);
        }

        const total = sceneState.products.reduce((sum, p) => sum + p.price * p.quantity, 0);
        sceneState.totalAmount = total;

        const productsList = sceneState.products
            .map(
                (p, i) =>
                    `${i + 1}. ${p.quantity}x ${p.name} (${p.side}) - ${p.price * p.quantity} so'm`,
            )
            .join('\n');

        await ctx.editMessageText(
            `💰 Buyurtma jami: ${total} so'm\n\n📦 Mahsulotlar:\n${productsList}\n\n💳 To'lov turini tanlang:`,
            Markup.inlineKeyboard(
                [
                    Markup.button.callback('💵 Naqd', `PAYMENT_${PaymentType.CASH}`),
                    Markup.button.callback('💳 Karta', `PAYMENT_${PaymentType.CARD}`),
                    Markup.button.callback('🏦 Kredit', `PAYMENT_${PaymentType.CREDIT}`),
                    Markup.button.callback('🔙 Orqaga', 'ADD_PRODUCT'),
                    Markup.button.callback('❌ Bekor', 'CANCEL_ORDER'),
                ],
                {
                    columns: 2, // Har bir qatordagi tugmalar soni. 2 yoki 3 qilib o'zgartirishingiz mumkin.
                },
            ),
        );
    }

    @Action(/^PAYMENT_(.+)$/)
    async onPaymentType(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) {
            return;
        }
        const paymentType = ctx.callbackQuery.data.replace('PAYMENT_', '');
        const sceneState = ctx.scene.state as NewOrderSceneState;
        sceneState.paymentType = paymentType as PaymentType;

        const productsList = sceneState.products
            .map(
                (p, i) =>
                    `${i + 1}. ${p.quantity}x ${p.name} (${p.side}) - ${p.price * p.quantity} so'm`,
            )
            .join('\n');

        const paymentEmoji =
            {
                [PaymentType.CASH]: '💵',
                [PaymentType.CARD]: '💳',
                [PaymentType.CREDIT]: '🏦',
            }[paymentType] || '💰';

        const paymentText =
            {
                [PaymentType.CASH]: "Naqd to'lov",
                [PaymentType.CARD]: "Karta to'lov",
                [PaymentType.CREDIT]: "Kredit to'lov",
            }[paymentType] || "To'lov";

        const orderSummary = `
📋 Buyurtmani tasdiqlang:

👤 Mijoz: ${sceneState.clientName}
📞 Telefon: ${sceneState.clientPhone}
${sceneState.clientBirthday ? `🎂 Tug'ilgan kun: ${sceneState.clientBirthday.toLocaleDateString('uz-UZ')}` : ''}

📦 Mahsulotlar:
${productsList}

💰 Jami: ${sceneState.totalAmount} so'm
${paymentEmoji} To'lov: ${paymentText}
    `;

        await ctx.editMessageText(
            orderSummary,
            Markup.inlineKeyboard(
                [
                    Markup.button.callback('✅ Tasdiqlash', 'CONFIRM_ORDER'),
                    Markup.button.callback('🔙 Orqaga', 'PAYMENT'),
                    Markup.button.callback('❌ Bekor', 'CANCEL_ORDER'),
                ],
                {
                    columns: 2, // Har bir qatordagi tugmalar soni. 2 yoki 3 qilib o'zgartirishingiz mumkin.
                },
            ),
        );
    }

    @Action('CONFIRM_ORDER')
    async onConfirmOrder(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as NewOrderSceneState;

        try {
            // Get user from database since ctx.user might not be available in scenes
            const telegramId = ctx.from?.id;
            if (!telegramId) {
                await ctx.editMessageText('❌ Telegram ID topilmadi.');
                await ctx.scene.leave();
                return;
            }

            const user = await this.prisma.user.findUnique({
                where: { telegram_id: telegramId },
                include: { branch: true },
            });

            if (!user) {
                await ctx.editMessageText("❌ Siz tizimda ro'yxatdan o'tmagansiz.");
                await ctx.scene.leave();
                return;
            }

            if (!user.branch_id) {
                await ctx.editMessageText('❌ Siz hech qanday filialga tayinlanmagansiz.');
                await ctx.scene.leave();
                return;
            }

            const orderNumber = `ORDER-${Date.now()}-${user.branch_id.slice(-4)}`;

            await this.prisma.order.create({
                data: {
                    order_number: orderNumber,
                    client_name: sceneState.clientName,
                    client_phone: sceneState.clientPhone,
                    client_birthday: sceneState.clientBirthday,
                    branch_id: user.branch_id,
                    cashier_id: user.id,
                    payment_type: sceneState.paymentType,
                    total_amount: sceneState.totalAmount,
                    order_products: {
                        create: sceneState.products.map((p) => ({
                            product_id: p.productId,
                            side: p.side,
                            quantity: p.quantity,
                            price: p.price,
                        })),
                    },
                },
            });

            await ctx.editMessageText(
                `✅ Buyurtma muvaffaqiyatli yaratildi!\n\n🔢 Buyurtma raqami: ${orderNumber}\n💰 Jami: ${sceneState.totalAmount} so'm\n\nRahmat!`,
            );
            await ctx.scene.leave();
        } catch (error) {
            console.error('Order creation error:', error);
            await ctx.editMessageText(
                "❌ Buyurtma yaratishda xatolik yuz berdi. Qaytadan urinib ko'ring.",
            );
            await ctx.scene.leave();
        }
    }

    @Action('CANCEL_ORDER')
    async onCancelOrder(@Ctx() ctx: Context) {
        await ctx.editMessageText('❌ Buyurtma bekor qilindi.');
        await ctx.scene.leave();
    }

    // Helper methods
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

    private getSideEmoji(side: string): string {
        const emojis = {
            oldi: '⬆️',
            orqa: '⬇️',
            left: '⬅️',
            right: '➡️',
        };
        return emojis[side.toLowerCase()] || '📍';
    }

    private capitalizeFirst(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}
