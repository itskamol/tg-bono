import { Scene, SceneEnter, On, Message, Action, Ctx } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';
import { PaymentType } from '@prisma/client';

interface PaymentEntry {
    type: PaymentType;
    amount: number;
}

interface NewOrderSceneState {
    products: any[];
    currentProduct: any;
    newProduct?: any;
    clientName?: string;
    clientPhone?: string | null;
    clientBirthday?: Date | null;
    birthdaySkipped?: boolean;
    phoneSkipped?: boolean;
    awaitingNewProductName?: boolean;
    awaitingNewProductPrice?: boolean;
    totalAmount?: number;

    // Yangi to'lov maydonlari
    payments?: PaymentEntry[];
    currentPayment?: PaymentEntry;
    remainingAmount?: number;
    awaitingPaymentAmount?: boolean;
}

@Scene('new-order-scene')
export class NewOrderScene {
    constructor(private readonly prisma: PrismaService) { }

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
        if (sceneState.clientPhone === undefined && !sceneState.phoneSkipped) {
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
            return;
        }

        // Step 6: Payment amount input
        if (sceneState.awaitingPaymentAmount && sceneState.currentPayment) {
            const amount = parseFloat(text);
            const remainingAmount = sceneState.remainingAmount || 0;

            const validation = this.validatePaymentAmount(amount, remainingAmount);
            if (!validation.isValid) {
                await ctx.reply(validation.error || "❌ Noto'g'ri miqdor.");
                return;
            }

            sceneState.currentPayment.amount = amount;

            if (!sceneState.payments) {
                sceneState.payments = [];
            }

            sceneState.payments.push({ ...sceneState.currentPayment });
            sceneState.remainingAmount = this.calculateRemainingAmount(sceneState.totalAmount || 0, sceneState.payments);
            sceneState.currentPayment = undefined;
            sceneState.awaitingPaymentAmount = false;

            return this.showPaymentSummary(ctx);
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

        const messageText = `✅ Mahsulot qo'shildi!

📦 Joriy mahsulotlar:
${productsList}

💰 Jami: ${total} so'm

Yana mahsulot qo'shasizmi?`;

        await ctx.reply(
            messageText,
            Markup.inlineKeyboard(
                [
                    Markup.button.callback('➕ Yana mahsulot', 'ADD_PRODUCT'),
                    Markup.button.callback("💳 To'lovga o'tish", 'PAYMENT'),
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
        sceneState.phoneSkipped = true;
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

        await this.safeEditOrReply(
            ctx,
            "⏭️ Tug'ilgan kun o'tkazib yuborildi.\n\n📦 Endi mahsulot qo'shamiz."
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

        try {
            await ctx.editMessageText(
                `${this.getTypeEmoji(type)} "${this.capitalizeFirst(
                    type,
                )}" tanlandi.\n\n📋 Mahsulotni tanlang:`,
                Markup.inlineKeyboard(
                    [
                        Markup.button.callback('➕ Yangi mahsulot', `CREATE_PRODUCT_${type}`),
                        Markup.button.callback('🔙 Orqaga', 'BACK_TO_TYPES'),
                        Markup.button.callback('❌ Bekor qilish', 'CANCEL_ORDER'),
                    ],
                    {
                        columns: 2,
                    },
                ),
            );
        } catch (error) {
            await ctx.reply(
                `${this.getTypeEmoji(type)} "${this.capitalizeFirst(
                    type,
                )}" tanlandi.\n\n📋 Mahsulotni tanlang:`,
                Markup.inlineKeyboard(
                    [
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
    }

    @Action(/^CREATE_PRODUCT_(.+)$/)
    async onCreateProduct(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) {
            return;
        }
        const type = ctx.callbackQuery.data.replace('CREATE_PRODUCT_', '');
        const sceneState = ctx.scene.state as NewOrderSceneState;
        sceneState.newProduct = { type };
        await this.safeEditOrReply(ctx, `🆕 Yangi mahsulot nomini kiriting:`);
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
            await this.safeEditOrReply(ctx, '❌ Mahsulot topilmadi.');
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

            await this.safeEditOrReply(
                ctx,
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
            await this.safeEditOrReply(ctx, `✅ "${product.name}" qo'shildi.`);
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
        await this.safeEditOrReply(
            ctx,
            `✅ "${sceneState.currentProduct.name}" (${this.capitalizeFirst(
                side,
            )}) qo'shildi.`
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
        await this.safeEditOrReply(ctx, "➕ Yana mahsulot qo'shish...");
        return this.showProductTypes(ctx);
    }

    @Action('PAYMENT')
    async onPayment(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as NewOrderSceneState;

        if (!sceneState.products || sceneState.products.length === 0) {
            await this.safeEditOrReply(ctx, "❌ Buyurtmada mahsulot yo'q. Avval mahsulot qo'shing.");
            return this.showProductTypes(ctx);
        }

        const total = sceneState.products.reduce((sum, p) => sum + p.price * p.quantity, 0);
        sceneState.totalAmount = total;
        sceneState.payments = [];
        sceneState.remainingAmount = total;

        return this.showPaymentTypeSelection(ctx);
    }



    @Action('CONFIRM_ORDER')
    async onConfirmOrder(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as NewOrderSceneState;

        // Check if payment is complete
        if (!this.isPaymentComplete(sceneState.totalAmount || 0, sceneState.payments || [])) {
            await this.safeEditOrReply(ctx, "❌ Barcha summa to'lanmagan. Avval to'lovni yakunlang.");
            return this.showPaymentSummary(ctx);
        }

        // Show final confirmation with all details
        const productsList = sceneState.products
            .map(
                (p, i) =>
                    `${i + 1}. ${p.quantity}x ${p.name} (${p.side}) - ${p.price * p.quantity} so'm`,
            )
            .join('\n');

        const paymentsText = this.formatPaymentsList(sceneState.payments || []);

        const orderSummary = `📋 Buyurtmani tasdiqlang:

👤 Mijoz: ${sceneState.clientName}
📞 Telefon: ${sceneState.clientPhone || "Ko'rsatilmagan"}
${sceneState.clientBirthday ? `🎂 Tug'ilgan kun: ${sceneState.clientBirthday.toLocaleDateString('uz-UZ')}` : ''}

📦 Mahsulotlar:
${productsList}

💳 To'lovlar:
${paymentsText}

💰 Jami: ${sceneState.totalAmount} so'm`;

        await this.safeEditOrReply(
            ctx,
            orderSummary,
            Markup.inlineKeyboard(
                [
                    Markup.button.callback('✅ Ha, tasdiqlash', 'FINAL_CONFIRM_ORDER'),
                    Markup.button.callback('🔙 Orqaga', 'BACK_TO_PAYMENT_SUMMARY'),
                    Markup.button.callback('❌ Bekor', 'CANCEL_ORDER'),
                ],
                {
                    columns: 1,
                },
            ),
        );
    }

    @Action('FINAL_CONFIRM_ORDER')
    async onFinalConfirmOrder(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as NewOrderSceneState;

        // Validate scene state before proceeding
        const validation = this.validateSceneState(sceneState);
        if (!validation.isValid) {
            await this.safeEditOrReply(ctx, validation.error || "❌ Ma'lumotlar noto'g'ri.");
            await ctx.scene.leave();
            return;
        }

        try {
            // Get user from database since ctx.user might not be available in scenes
            const telegramId = ctx.from?.id;
            if (!telegramId) {
                await this.safeEditOrReply(ctx, '❌ Telegram ID topilmadi.');
                await ctx.scene.leave();
                return;
            }

            const user = await this.prisma.user.findUnique({
                where: { telegram_id: telegramId },
                include: { branch: true },
            });

            if (!user) {
                await this.safeEditOrReply(ctx, "❌ Siz tizimda ro'yxatdan o'tmagansiz.");
                await ctx.scene.leave();
                return;
            }

            if (!user.branch_id) {
                await this.safeEditOrReply(ctx, '❌ Siz hech qanday filialga tayinlanmagansiz.');
                await ctx.scene.leave();
                return;
            }

            const orderNumber = `ORDER-${Date.now()}-${user.branch_id.slice(-4)}`;

            // Use transaction to create order and payments atomically
            await this.prisma.$transaction(async (prisma) => {
                // Create the order
                const order = await prisma.order.create({
                    data: {
                        order_number: orderNumber,
                        client_name: sceneState.clientName,
                        client_phone: sceneState.clientPhone,
                        client_birthday: sceneState.clientBirthday,
                        branch: {
                            connect: { id: user.branch_id }
                        },
                        cashier: {
                            connect: { id: user.id }
                        },
                        total_amount: sceneState.totalAmount,
                        order_products: {
                            create: sceneState.products.map((p) => ({
                                product: {
                                    connect: { id: p.productId }
                                },
                                side: p.side,
                                quantity: p.quantity,
                                price: p.price,
                            })),
                        },
                    },
                });

                // Create payment records
                if (sceneState.payments && sceneState.payments.length > 0) {
                    await prisma.payment.createMany({
                        data: sceneState.payments.map((payment) => ({
                            order_id: order.id,
                            payment_type: payment.type,
                            amount: payment.amount,
                        })),
                    });
                }
            });

            const paymentsText = this.formatPaymentsList(sceneState.payments || []);

            await this.safeEditOrReply(
                ctx,
                `✅ Buyurtma muvaffaqiyatli yaratildi!\n\n🔢 Buyurtma raqami: ${orderNumber}\n\n💳 To'lovlar:\n${paymentsText}\n\n💰 Jami: ${sceneState.totalAmount} so'm\n\nRahmat!`
            );
            await ctx.scene.leave();
        } catch (error) {
            console.error('Order creation error:', error);

            let errorMessage = "❌ Buyurtma yaratishda xatolik yuz berdi.";

            if (error instanceof Error) {
                if (error.message.includes('duplicate')) {
                    errorMessage = "❌ Buyurtma raqami allaqachon mavjud. Qaytadan urinib ko'ring.";
                } else if (error.message.includes('connection')) {
                    errorMessage = "❌ Ma'lumotlar bazasiga ulanishda xatolik. Internetni tekshiring.";
                } else if (error.message.includes('validation')) {
                    errorMessage = "❌ Ma'lumotlar noto'g'ri. Qaytadan tekshiring.";
                }
            }

            await this.safeEditOrReply(
                ctx,
                `${errorMessage}\n\nQaytadan urinib ko'ring yoki administratorga murojaat qiling.`,
                Markup.inlineKeyboard([
                    Markup.button.callback('🔄 Qaytadan urinish', 'FINAL_CONFIRM_ORDER'),
                    Markup.button.callback('🔙 Orqaga', 'BACK_TO_PAYMENT_SUMMARY'),
                    Markup.button.callback('❌ Bekor qilish', 'CANCEL_ORDER'),
                ])
            );
        }
    }

    @Action('BACK_TO_PAYMENT_SUMMARY')
    async onBackToPaymentSummary(@Ctx() ctx: Context) {
        return this.showPaymentSummary(ctx);
    }

    @Action('CANCEL_ORDER')
    async onCancelOrder(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as NewOrderSceneState;

        // If there are payments, ask for confirmation
        if (sceneState.payments && sceneState.payments.length > 0) {
            await this.safeEditOrReply(
                ctx,
                `⚠️ Siz ${sceneState.payments.length} ta to'lov qo'shgansiz.\n\nHaqiqatan ham buyurtmani bekor qilmoqchimisiz?`,
                Markup.inlineKeyboard([
                    Markup.button.callback('✅ Ha, bekor qilish', 'CONFIRM_CANCEL_ORDER'),
                    Markup.button.callback('❌ Yo\'q, davom etish', 'BACK_TO_PAYMENT_SUMMARY'),
                ])
            );
        } else {
            await this.safeEditOrReply(ctx, '❌ Buyurtma bekor qilindi.');
            await ctx.scene.leave();
        }
    }

    @Action('CONFIRM_CANCEL_ORDER')
    async onConfirmCancelOrder(@Ctx() ctx: Context) {
        await this.safeEditOrReply(ctx, '❌ Buyurtma bekor qilindi.');
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

    private async safeEditOrReply(ctx: Context, text: string, extra?: any) {
        try {
            await ctx.editMessageText(text, extra);
        } catch (error) {
            await ctx.reply(text, extra);
        }
    }

    // Payment calculation utilities
    private calculateRemainingAmount(totalAmount: number, payments: PaymentEntry[]): number {
        if (!payments || payments.length === 0) {
            return totalAmount;
        }
        const paidAmount = payments.reduce((sum, payment) => sum + payment.amount, 0);
        return Math.max(0, totalAmount - paidAmount);
    }

    private validatePaymentAmount(amount: number, remainingAmount: number): { isValid: boolean; error?: string } {
        if (isNaN(amount)) {
            return { isValid: false, error: "❌ Noto'g'ri raqam formati. Faqat raqam kiriting." };
        }
        if (amount <= 0) {
            return { isValid: false, error: "❌ Miqdor 0 dan katta bo'lishi kerak." };
        }
        if (amount > remainingAmount) {
            return { isValid: false, error: `❌ Kiritilgan miqdor qolgan summadan ko'p.\nMaksimal: ${remainingAmount} so'm` };
        }
        if (amount !== Math.floor(amount)) {
            return { isValid: false, error: "❌ Faqat butun sonlar qabul qilinadi." };
        }
        if (amount > 10000000) { // 10 million limit
            return { isValid: false, error: "❌ Miqdor juda katta. Maksimal: 10,000,000 so'm" };
        }
        return { isValid: true };
    }

    private validateSceneState(sceneState: NewOrderSceneState): { isValid: boolean; error?: string } {
        if (!sceneState.clientName) {
            return { isValid: false, error: "❌ Mijoz ismi kiritilmagan." };
        }
        if (!sceneState.products || sceneState.products.length === 0) {
            return { isValid: false, error: "❌ Hech qanday mahsulot tanlanmagan." };
        }
        if (!sceneState.totalAmount || sceneState.totalAmount <= 0) {
            return { isValid: false, error: "❌ Buyurtma summasi noto'g'ri." };
        }
        if (!sceneState.payments || sceneState.payments.length === 0) {
            return { isValid: false, error: "❌ Hech qanday to'lov qo'shilmagan." };
        }
        return { isValid: true };
    }

    private isPaymentComplete(totalAmount: number, payments: PaymentEntry[]): boolean {
        return this.calculateRemainingAmount(totalAmount, payments) === 0;
    }

    private formatPaymentsList(payments: PaymentEntry[]): string {
        if (!payments || payments.length === 0) {
            return "Hech qanday to'lov qo'shilmagan";
        }

        return payments.map((payment, index) => {
            const emoji = this.getPaymentTypeEmoji(payment.type);
            const typeName = this.getPaymentTypeName(payment.type);
            return `${index + 1}. ${emoji} ${typeName}: ${payment.amount} so'm`;
        }).join('\n');
    }

    private getPaymentTypeEmoji(paymentType: PaymentType): string {
        const emojis = {
            [PaymentType.CASH]: '💵',
            [PaymentType.CARD]: '💳',
            [PaymentType.CREDIT]: '🏦',
        };
        return emojis[paymentType] || '💰';
    }

    private getPaymentTypeName(paymentType: PaymentType): string {
        const names = {
            [PaymentType.CASH]: 'Naqd',
            [PaymentType.CARD]: 'Karta',
            [PaymentType.CREDIT]: 'Kredit',
        };
        return names[paymentType] || 'Noma\'lum';
    }

    async showPaymentTypeSelection(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as NewOrderSceneState;

        const productsList = sceneState.products
            .map(
                (p, i) =>
                    `${i + 1}. ${p.quantity}x ${p.name} (${p.side}) - ${p.price * p.quantity} so'm`,
            )
            .join('\n');

        const paymentsText = sceneState.payments && sceneState.payments.length > 0
            ? `\n\n📋 Joriy to'lovlar:\n${this.formatPaymentsList(sceneState.payments)}\n`
            : '';

        const messageText = `💰 Buyurtma jami: ${sceneState.totalAmount} so'm
📦 Mahsulotlar:
${productsList}${paymentsText}
💰 Qolgan summa: ${sceneState.remainingAmount} so'm

💳 To'lov turini tanlang:`;

        await this.safeEditOrReply(
            ctx,
            messageText,
            Markup.inlineKeyboard(
                [
                    Markup.button.callback('� Naaqd', 'PAYMENT_TYPE_CASH'),
                    Markup.button.callback('💳 Karta', 'PAYMENT_TYPE_CARD'),
                    Markup.button.callback('🏦 Kredit', 'PAYMENT_TYPE_CREDIT'),
                    Markup.button.callback('🔙 Orqaga', 'ADD_PRODUCT'),
                    Markup.button.callback('❌ Bekor', 'CANCEL_ORDER'),
                ],
                {
                    columns: 2,
                },
            ),
        );
    }

    @Action('PAYMENT_TYPE_CASH')
    async onPaymentTypeCash(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as NewOrderSceneState;
        sceneState.currentPayment = { type: PaymentType.CASH, amount: 0 };
        return this.showPaymentAmountSelection(ctx);
    }

    @Action('PAYMENT_TYPE_CARD')
    async onPaymentTypeCard(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as NewOrderSceneState;
        sceneState.currentPayment = { type: PaymentType.CARD, amount: 0 };
        return this.showPaymentAmountSelection(ctx);
    }

    @Action('PAYMENT_TYPE_CREDIT')
    async onPaymentTypeCredit(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as NewOrderSceneState;
        sceneState.currentPayment = { type: PaymentType.CREDIT, amount: 0 };
        return this.showPaymentAmountSelection(ctx);
    }

    async showPaymentAmountSelection(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as NewOrderSceneState;

        if (!sceneState.currentPayment) {
            return this.showPaymentTypeSelection(ctx);
        }

        const paymentEmoji = this.getPaymentTypeEmoji(sceneState.currentPayment.type);
        const paymentName = this.getPaymentTypeName(sceneState.currentPayment.type);

        const messageText = `${paymentEmoji} ${paymentName} to'lov tanlandi
💰 Jami: ${sceneState.totalAmount} so'm
💰 Qolgan: ${sceneState.remainingAmount} so'm

Miqdorni tanlang:`;

        await this.safeEditOrReply(
            ctx,
            messageText,
            Markup.inlineKeyboard(
                [
                    Markup.button.callback(`💯 Hammasini (${sceneState.remainingAmount} so'm)`, 'PAYMENT_AMOUNT_ALL'),
                    Markup.button.callback('✏️ Boshqa miqdor', 'PAYMENT_AMOUNT_CUSTOM'),
                    Markup.button.callback('🔙 Orqaga', 'PAYMENT_BACK_TO_TYPE'),
                    Markup.button.callback('❌ Bekor', 'CANCEL_ORDER'),
                ],
                {
                    columns: 1,
                },
            ),
        );
    }

    @Action('PAYMENT_AMOUNT_ALL')
    async onPaymentAmountAll(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as NewOrderSceneState;

        if (!sceneState.currentPayment) {
            return this.showPaymentTypeSelection(ctx);
        }

        sceneState.currentPayment.amount = sceneState.remainingAmount || 0;

        if (!sceneState.payments) {
            sceneState.payments = [];
        }

        sceneState.payments.push({ ...sceneState.currentPayment });
        sceneState.remainingAmount = this.calculateRemainingAmount(sceneState.totalAmount || 0, sceneState.payments);
        sceneState.currentPayment = undefined;

        return this.showPaymentSummary(ctx);
    }

    @Action('PAYMENT_AMOUNT_CUSTOM')
    async onPaymentAmountCustom(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as NewOrderSceneState;

        if (!sceneState.currentPayment) {
            return this.showPaymentTypeSelection(ctx);
        }

        const paymentEmoji = this.getPaymentTypeEmoji(sceneState.currentPayment.type);
        const paymentName = this.getPaymentTypeName(sceneState.currentPayment.type);

        sceneState.awaitingPaymentAmount = true;

        await this.safeEditOrReply(
            ctx,
            `${paymentEmoji} ${paymentName} to'lov
💰 Qolgan summa: ${sceneState.remainingAmount} so'm

Miqdorni kiriting (1-${sceneState.remainingAmount}):`
        );
    }

    @Action('PAYMENT_BACK_TO_TYPE')
    async onPaymentBackToType(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as NewOrderSceneState;
        sceneState.currentPayment = undefined;
        sceneState.awaitingPaymentAmount = false;
        return this.showPaymentTypeSelection(ctx);
    }

    async showPaymentSummary(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as NewOrderSceneState;

        const isComplete = this.isPaymentComplete(sceneState.totalAmount || 0, sceneState.payments || []);
        const remainingAmount = sceneState.remainingAmount || 0;

        const paymentsText = this.formatPaymentsList(sceneState.payments || []);

        let messageText = `✅ To'lov qo'shildi!\n\n📋 Joriy to'lovlar:\n${paymentsText}\n\n💰 Jami: ${sceneState.totalAmount} so'm`;

        if (!isComplete) {
            messageText += `\n💰 Qolgan: ${remainingAmount} so'm\n\nYana to'lov qo'shasizmi?`;
        } else {
            messageText += `\n✅ Barcha summa to'landi!\n\nBuyurtmani tasdiqlaysizmi?`;
        }

        const buttons = [];

        if (!isComplete) {
            buttons.push(
                Markup.button.callback('➕ Yana to\'lov', 'ADD_ANOTHER_PAYMENT'),
                Markup.button.callback('🗑️ Oxirgi to\'lovni o\'chirish', 'REMOVE_LAST_PAYMENT')
            );
        }

        if (isComplete) {
            buttons.push(Markup.button.callback('✅ Tasdiqlash', 'CONFIRM_ORDER'));
        }

        buttons.push(
            Markup.button.callback('🔙 Orqaga', 'PAYMENT_BACK_TO_TYPE'),
            Markup.button.callback('❌ Bekor', 'CANCEL_ORDER')
        );

        await this.safeEditOrReply(
            ctx,
            messageText,
            Markup.inlineKeyboard(buttons, { columns: 2 })
        );
    }

    @Action('ADD_ANOTHER_PAYMENT')
    async onAddAnotherPayment(@Ctx() ctx: Context) {
        return this.showPaymentTypeSelection(ctx);
    }

    @Action('REMOVE_LAST_PAYMENT')
    async onRemoveLastPayment(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as NewOrderSceneState;

        if (!sceneState.payments || sceneState.payments.length === 0) {
            await ctx.reply("❌ Hech qanday to'lov mavjud emas.");
            return this.showPaymentTypeSelection(ctx);
        }

        sceneState.payments.pop();
        sceneState.remainingAmount = this.calculateRemainingAmount(sceneState.totalAmount || 0, sceneState.payments);

        if (sceneState.payments.length === 0) {
            return this.showPaymentTypeSelection(ctx);
        } else {
            return this.showPaymentSummary(ctx);
        }
    }
}
