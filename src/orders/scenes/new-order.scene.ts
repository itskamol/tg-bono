import { Scene, SceneEnter, On, Message, Action, Ctx } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';
import { PaymentType } from '@prisma/client';
import { formatCurrency } from 'src/utils/format.utils';

interface PaymentEntry {
    type: PaymentType;
    amount: number;
}

interface NewOrderSceneState {
    products: any[];
    currentProduct: any;
    clientName?: string;
    clientPhone?: string | null;
    clientBirthday?: Date | null;
    birthdaySkipped?: boolean;
    phoneSkipped?: boolean;
    awaitingProductName?: boolean;
    awaitingProductPrice?: boolean;
    isCustomProduct?: boolean; // Custom mahsulot uchun
    totalAmount?: number;

    // Yangi to'lov maydonlari
    payments?: PaymentEntry[];
    currentPayment?: PaymentEntry;
    remainingAmount?: number;
    awaitingPaymentAmount?: boolean;
}

@Scene('new-order-scene')
export class NewOrderScene {
    constructor(private readonly prisma: PrismaService) {}

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        return this.newOrderScene(ctx);
    }

    async newOrderScene(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as NewOrderSceneState;
        sceneState.products = [];
        sceneState.currentProduct = {};

        await this.safeEditOrReply(
            ctx,
            '🛒 Yangi buyurtma yaratish\n\n👤 Mijozning ismini kiriting:',
            Markup.inlineKeyboard([Markup.button.callback('❌ Bekor qilish', 'CANCEL_ORDER')]),
        );
    }

    @Action('START_NEW_ORDER')
    async onStartNewOrder(@Ctx() ctx: Context) {
        return this.newOrderScene(ctx);
    }

    @On('text')
    async onText(@Ctx() ctx: Context, @Message('text') text: string) {
        const sceneState = ctx.scene.state as NewOrderSceneState;

        // Step 1: Client Name
        if (!sceneState.clientName) {
            sceneState.clientName = text;
            await this.safeEditOrReply(
                ctx,
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
                await this.safeEditOrReply(
                    ctx,
                    "❌ Noto'g'ri telefon raqam formati. Qaytadan kiriting:",
                );
                return;
            }
            sceneState.clientPhone = text;
            await this.safeEditOrReply(
                ctx,
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
                await this.safeEditOrReply(
                    ctx,
                    "❌ Noto'g'ri sana formati. YYYY-MM-DD formatida kiriting (masalan: 1990-05-15):",
                );
                return;
            }

            const birthday = new Date(text);
            if (isNaN(birthday.getTime()) || birthday > new Date()) {
                await this.safeEditOrReply(ctx, "❌ Noto'g'ri sana. Qaytadan kiriting:");
                return;
            }

            sceneState.clientBirthday = birthday;
            await this.safeEditOrReply(
                ctx,
                `✅ Tug'ilgan kun: ${text}\n\n📦 Endi mahsulot qo'shamiz.`,
            );
            return this.showProductTypes(ctx);
        }

        // Step 4: Mahsulot nomi
        if (sceneState.awaitingProductName) {
            sceneState.currentProduct.name = text;
            sceneState.awaitingProductName = false;

            // Custom mahsulot uchun narx so'rash
            if (sceneState.isCustomProduct) {
                sceneState.awaitingProductPrice = true;
                await this.safeEditOrReply(
                    ctx,
                    `✅ Mahsulot nomi: ${text}\n\n💰 Narxini kiriting (so'mda):`,
                    Markup.inlineKeyboard([
                        Markup.button.callback('🔙 Orqaga', 'BACK_TO_TYPES'),
                        Markup.button.callback('❌ Bekor qilish', 'CANCEL_ORDER'),
                    ]),
                );
                return;
            } else {
                // Mavjud kategoriya uchun sides tanlash
                return this.showSidesSelection(ctx);
            }
        }

        // Step 5: Custom mahsulot narxi (faqat custom uchun)
        if (sceneState.awaitingProductPrice && sceneState.isCustomProduct) {
            const price = parseFloat(text);
            if (isNaN(price) || price <= 0) {
                await this.safeEditOrReply(ctx, "❌ Noto'g'ri narx. Faqat musbat raqam kiriting:");
                return;
            }

            sceneState.currentProduct.price = price;
            sceneState.currentProduct.quantity = 1;
            sceneState.awaitingProductPrice = false;

            // Custom mahsulot uchun sides yo'q, to'g'ridan-to'g'ri qo'shish
            const productName = sceneState.currentProduct.name;
            sceneState.products.push({ ...sceneState.currentProduct });
            sceneState.currentProduct = {};
            sceneState.isCustomProduct = false;

            await this.safeEditOrReply(
                ctx,
                `✅ "${productName}" qo'shildi.\n💰 Narx: ${formatCurrency(price)}`,
            );
            return this.showOrderSummary(ctx);
        }

        // Mahsulot qidirish olib tashlandi - faqat dinamik kiritish

        // Step 6: Payment amount input
        if (sceneState.awaitingPaymentAmount && sceneState.currentPayment) {
            const amount = parseFloat(text);
            const remainingAmount = sceneState.remainingAmount || 0;

            const validation = this.validatePaymentAmount(amount, remainingAmount);
            if (!validation.isValid) {
                await this.safeEditOrReply(ctx, validation.error || "❌ Noto'g'ri miqdor.");
                return;
            }

            sceneState.currentPayment.amount = amount;

            if (!sceneState.payments) {
                sceneState.payments = [];
            }

            sceneState.payments.push({ ...sceneState.currentPayment });
            sceneState.remainingAmount = this.calculateRemainingAmount(
                sceneState.totalAmount || 0,
                sceneState.payments,
            );
            sceneState.currentPayment = undefined;
            sceneState.awaitingPaymentAmount = false;

            return this.showPaymentSummary(ctx);
        }
    }

    async showOrderSummary(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as NewOrderSceneState;
        const total = sceneState.products.reduce((sum, p) => sum + p.price * p.quantity, 0);
        const productsList = sceneState.products
            .map((p, i) => {
                const sideInfo = p.sideName ? ` (${p.sideName})` : '';
                return `${i + 1}. ${p.quantity}x ${p.name}${sideInfo} - ${formatCurrency(p.price * p.quantity)}`;
            })
            .join('\n');

        const messageText = `✅ Mahsulot qo'shildi!

📦 Joriy mahsulotlar:
${productsList}

💰 Jami: ${formatCurrency(total)}

Yana mahsulot qo'shasizmi?`;

        await this.safeEditOrReply(
            ctx,
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
        await this.safeEditOrReply(
            ctx,
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
            "⏭️ Tug'ilgan kun o'tkazib yuborildi.\n\n📦 Endi mahsulot qo'shamiz.",
        );
        return this.showProductTypes(ctx);
    }

    async showProductTypes(ctx: Context) {
        try {
            // Database'dan kategoriyalarni olish
            const categories = await this.prisma.category.findMany({
                orderBy: { name: 'asc' },
            });

            const typeButtons = categories.map((category) =>
                Markup.button.callback(`${category.name}`, `TYPE_${category.id}`),
            );

            // Custom mahsulot tugmasini qo'shish
            typeButtons.push(Markup.button.callback('🔧 Custom mahsulot', 'TYPE_CUSTOM'));

            await this.safeEditOrReply(
                ctx,
                '📦 Mahsulot kategoriyasini tanlang:',
                Markup.inlineKeyboard(
                    [...typeButtons, Markup.button.callback('❌ Bekor qilish', 'CANCEL_ORDER')],
                    {
                        columns: 2,
                    },
                ),
            );
        } catch (error) {
            await this.safeEditOrReply(
                ctx,
                "❌ Kategoriyalarni yuklashda xatolik. Qaytadan urinib ko'ring.",
                Markup.inlineKeyboard([
                    Markup.button.callback('🔄 Qaytadan', 'RETRY_CATEGORIES'),
                    Markup.button.callback('❌ Bekor qilish', 'CANCEL_ORDER'),
                ]),
            );
        }
    }

    @Action(/^TYPE_(.+)$/)
    async onProductType(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) {
            return;
        }
        const typeData = ctx.callbackQuery.data.replace('TYPE_', '');
        const sceneState = ctx.scene.state as NewOrderSceneState;

        // Custom mahsulot uchun
        if (typeData === 'CUSTOM') {
            sceneState.isCustomProduct = true;
            sceneState.currentProduct.category = 'Custom';

            await this.safeEditOrReply(
                ctx,
                '🔧 Custom mahsulot tanlandi.\n\n📝 Mahsulot nomini kiriting:',
                Markup.inlineKeyboard([
                    Markup.button.callback('🔙 Orqaga', 'BACK_TO_TYPES'),
                    Markup.button.callback('❌ Bekor qilish', 'CANCEL_ORDER'),
                ]),
            );
            sceneState.awaitingProductName = true;
            return;
        }

        // Mavjud kategoriya uchun
        try {
            const category = await this.prisma.category.findUnique({
                where: { id: typeData },
            });

            if (!category) {
                await this.safeEditOrReply(ctx, '❌ Kategoriya topilmadi.');
                return this.showProductTypes(ctx);
            }

            sceneState.currentProduct.category = category.name;
            sceneState.currentProduct.categoryId = category.id;
            sceneState.isCustomProduct = false;

            await this.safeEditOrReply(
                ctx,
                `"${category.name}" kategoriyasi tanlandi.\n\n📝 Mahsulot nomini kiriting:`,
                Markup.inlineKeyboard([
                    Markup.button.callback('🔙 Orqaga', 'BACK_TO_TYPES'),
                    Markup.button.callback('❌ Bekor qilish', 'CANCEL_ORDER'),
                ]),
            );
            sceneState.awaitingProductName = true;
        } catch (error) {
            await this.safeEditOrReply(ctx, '❌ Kategoriya yuklashda xatolik.');
            return this.showProductTypes(ctx);
        }
    }

    @Action(/^SELECT_SIDE_(.+)$/)
    async onSelectSide(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) {
            return;
        }
        const sideId = ctx.callbackQuery.data.replace('SELECT_SIDE_', '');
        const sceneState = ctx.scene.state as NewOrderSceneState;

        const side = await this.prisma.side.findUnique({
            where: { id: sideId },
        });

        if (!side) {
            await this.safeEditOrReply(ctx, '❌ Tomon topilmadi.');
            return;
        }

        // Side price = total price (base price yo'q)
        sceneState.currentProduct.sideName = side.name;
        sceneState.currentProduct.price = side.price; // Side narxi = mahsulot narxi
        sceneState.currentProduct.quantity = 1;

        // Mahsulotni ro'yxatga qo'shish
        sceneState.products.push({ ...sceneState.currentProduct });

        await this.safeEditOrReply(
            ctx,
            `✅ "${sceneState.currentProduct.name}" (${side.name}) qo'shildi.\n💰 Narx: ${formatCurrency(side.price)}`,
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
            await this.safeEditOrReply(
                ctx,
                "❌ Buyurtmada mahsulot yo'q. Avval mahsulot qo'shing.",
            );
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
            await this.safeEditOrReply(
                ctx,
                "❌ Barcha summa to'lanmagan. Avval to'lovni yakunlang.",
            );
            return this.showPaymentSummary(ctx);
        }

        // Show final confirmation with all details
        const productsList = sceneState.products
            .map((p, i) => {
                const sideInfo = p.sideName ? ` (${p.sideName})` : '';
                return `${i + 1}. ${p.quantity}x ${p.name}${sideInfo} - ${formatCurrency(p.price * p.quantity)}`;
            })
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

💰 Jami: ${formatCurrency(sceneState.totalAmount)}`;

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
                            connect: { id: user.branch_id },
                        },
                        cashier: {
                            connect: { id: user.id },
                        },
                        total_amount: sceneState.totalAmount,
                        order_products: {
                            create: sceneState.products.map((p) => ({
                                product_name: p.name,
                                category: p.category || 'custom',
                                side_name: p.sideName || 'custom',
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
                `✅ Buyurtma muvaffaqiyatli yaratildi!\n\n🔢 Buyurtma raqami: ${orderNumber}\n\n💳 To'lovlar:\n${paymentsText}\n\n💰 Jami: ${formatCurrency(sceneState.totalAmount)} \n\nRahmat!`,
                Markup.inlineKeyboard([
                    Markup.button.callback('🆕 Yangi buyurtma', 'START_NEW_ORDER'),
                ]),
            );
            await ctx.scene.leave();
        } catch (error) {
            let errorMessage = '❌ Buyurtma yaratishda xatolik yuz berdi.';

            if (error instanceof Error) {
                if (error.message.includes('duplicate')) {
                    errorMessage = "❌ Buyurtma raqami allaqachon mavjud. Qaytadan urinib ko'ring.";
                } else if (error.message.includes('connection')) {
                    errorMessage =
                        "❌ Ma'lumotlar bazasiga ulanishda xatolik. Internetni tekshiring.";
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
                ]),
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
                    Markup.button.callback("❌ Yo'q, davom etish", 'BACK_TO_PAYMENT_SUMMARY'),
                ]),
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

    private async safeEditOrReply(ctx: Context, text: string, extra?: any) {
        try {
            await ctx.editMessageText(text, extra);
        } catch (error) {
            await ctx.reply(text, extra);
        }
    }

    async showSidesSelection(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as NewOrderSceneState;

        try {
            // Barcha sides'larni olish
            const sides = await this.prisma.side.findMany({
                where: { category_id: sceneState.currentProduct.categoryId },
                orderBy: { price: 'asc' },
            });

            if (sides.length === 0) {
                await this.safeEditOrReply(
                    ctx,
                    '❌ Hech qanday tomon mavjud emas. Administratorga murojaat qiling.',
                    Markup.inlineKeyboard([
                        Markup.button.callback('🔙 Orqaga', 'BACK_TO_TYPES'),
                        Markup.button.callback('❌ Bekor qilish', 'CANCEL_ORDER'),
                    ]),
                );
                return;
            }

            const sideButtons = sides.map((side) =>
                Markup.button.callback(
                    `${side.name} - ${formatCurrency(side.price)}`,
                    `SELECT_SIDE_${side.id}`,
                ),
            );

            await this.safeEditOrReply(
                ctx,
                `📦 "${sceneState.currentProduct.name}" tanlandi\n\n🍕 Tomonni tanlang (narx = tomon narxi):`,
                Markup.inlineKeyboard(
                    [
                        ...sideButtons,
                        Markup.button.callback('🔙 Orqaga', 'BACK_TO_TYPES'),
                        Markup.button.callback('❌ Bekor qilish', 'CANCEL_ORDER'),
                    ],
                    { columns: 1 },
                ),
            );
        } catch (error) {
            await this.safeEditOrReply(
                ctx,
                '❌ Tomonlarni yuklashda xatolik.',
                Markup.inlineKeyboard([
                    Markup.button.callback('🔄 Qaytadan', 'RETRY_SIDES'),
                    Markup.button.callback('🔙 Orqaga', 'BACK_TO_TYPES'),
                    Markup.button.callback('❌ Bekor qilish', 'CANCEL_ORDER'),
                ]),
            );
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

    private validatePaymentAmount(
        amount: number,
        remainingAmount: number,
    ): { isValid: boolean; error?: string } {
        if (isNaN(amount)) {
            return { isValid: false, error: "❌ Noto'g'ri raqam formati. Faqat raqam kiriting." };
        }
        if (amount <= 0) {
            return { isValid: false, error: "❌ Miqdor 0 dan katta bo'lishi kerak." };
        }
        if (amount > remainingAmount) {
            return {
                isValid: false,
                error: `❌ Kiritilgan miqdor qolgan summadan ko'p.\nMaksimal: ${formatCurrency(remainingAmount)}`,
            };
        }
        if (amount !== Math.floor(amount)) {
            return { isValid: false, error: '❌ Faqat butun sonlar qabul qilinadi.' };
        }
        if (amount > 10000000) {
            return { isValid: false, error: "❌ Miqdor juda katta. Maksimal: 10,000,000 so'm" };
        }
        return { isValid: true };
    }

    private validateSceneState(sceneState: NewOrderSceneState): {
        isValid: boolean;
        error?: string;
    } {
        if (!sceneState.clientName) {
            return { isValid: false, error: '❌ Mijoz ismi kiritilmagan.' };
        }
        if (!sceneState.products || sceneState.products.length === 0) {
            return { isValid: false, error: '❌ Hech qanday mahsulot tanlanmagan.' };
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

        return payments
            .map((payment, index) => {
                const emoji = this.getPaymentTypeEmoji(payment.type);
                const typeName = this.getPaymentTypeName(payment.type);
                return `${index + 1}. ${emoji} ${typeName}: ${formatCurrency(payment.amount)}`;
            })
            .join('\n');
    }

    private getPaymentTypeEmoji(paymentType: PaymentType): string {
        const emojis = {
            [PaymentType.CASH]: '💵',
            [PaymentType.CARD]: '💳',
            [PaymentType.TRANSFER]: '📱',
        };
        return emojis[paymentType] || '💰';
    }

    private getPaymentTypeName(paymentType: PaymentType): string {
        const names = {
            [PaymentType.CASH]: 'Naqd',
            [PaymentType.CARD]: 'Karta',
            [PaymentType.TRANSFER]: 'Nasiya',
        };
        return names[paymentType] || paymentType;
    }

    async showPaymentTypeSelection(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as NewOrderSceneState;
        const remainingAmount = sceneState.remainingAmount || 0;

        if (remainingAmount <= 0) {
            return this.showPaymentSummary(ctx);
        }

        await this.safeEditOrReply(
            ctx,
            `💳 To'lov turi tanlang\n\n💰 Qolgan summa: ${formatCurrency(remainingAmount)}`,
            Markup.inlineKeyboard(
                [
                    Markup.button.callback('💵 Naqd', 'PAYMENT_TYPE_CASH'),
                    Markup.button.callback('💳 Karta', 'PAYMENT_TYPE_CARD'),
                    Markup.button.callback('📱 Nasiya', 'PAYMENT_TYPE_TRANSFER'),
                    Markup.button.callback('🔙 Orqaga', 'BACK_TO_ORDER_SUMMARY'),
                    Markup.button.callback('❌ Bekor qilish', 'CANCEL_ORDER'),
                ],
                { columns: 2 },
            ),
        );
    }

    @Action(/^PAYMENT_TYPE_(.+)$/)
    async onPaymentType(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) {
            return;
        }
        const paymentType = ctx.callbackQuery.data.replace('PAYMENT_TYPE_', '') as PaymentType;
        const sceneState = ctx.scene.state as NewOrderSceneState;

        sceneState.currentPayment = {
            type: paymentType,
            amount: 0,
        };

        const remainingAmount = sceneState.remainingAmount || 0;
        const typeName = this.getPaymentTypeName(paymentType);
        const emoji = this.getPaymentTypeEmoji(paymentType);

        await this.safeEditOrReply(
            ctx,
            `${emoji} ${typeName} to'lov tanlandi\n\n💰 Qolgan summa: ${formatCurrency(remainingAmount)} \n\n💵 To'lov miqdorini kiriting:`,
            Markup.inlineKeyboard(
                [
                    Markup.button.callback(
                        `💯 Barcha (${formatCurrency(remainingAmount)})`,
                        'PAY_ALL_REMAINING',
                    ),
                    Markup.button.callback('🔙 Orqaga', 'BACK_TO_PAYMENT_TYPE'),
                    Markup.button.callback('❌ Bekor qilish', 'CANCEL_ORDER'),
                ],
                {
                    columns: 2,
                },
            ),
        );

        sceneState.awaitingPaymentAmount = true;
    }

    @Action('PAY_ALL_REMAINING')
    async onPayAllRemaining(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as NewOrderSceneState;
        const remainingAmount = sceneState.remainingAmount || 0;

        if (!sceneState.currentPayment) {
            await this.safeEditOrReply(ctx, "❌ To'lov turi tanlanmagan.");
            return this.showPaymentTypeSelection(ctx);
        }

        sceneState.currentPayment.amount = remainingAmount;

        if (!sceneState.payments) {
            sceneState.payments = [];
        }

        sceneState.payments.push({ ...sceneState.currentPayment });
        sceneState.remainingAmount = 0;
        sceneState.currentPayment = undefined;
        sceneState.awaitingPaymentAmount = false;

        return this.showPaymentSummary(ctx);
    }

    @Action('BACK_TO_PAYMENT_TYPE')
    async onBackToPaymentType(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as NewOrderSceneState;
        sceneState.currentPayment = undefined;
        sceneState.awaitingPaymentAmount = false;
        return this.showPaymentTypeSelection(ctx);
    }

    @Action('BACK_TO_ORDER_SUMMARY')
    async onBackToOrderSummary(@Ctx() ctx: Context) {
        return this.showOrderSummary(ctx);
    }

    async showPaymentSummary(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as NewOrderSceneState;
        const totalAmount = sceneState.totalAmount || 0;
        const payments = sceneState.payments || [];
        const remainingAmount = this.calculateRemainingAmount(totalAmount, payments);

        const paymentsText = this.formatPaymentsList(payments);
        const isComplete = remainingAmount === 0;

        let messageText = `💳 To'lov xulosasi:\n\n${paymentsText}\n\n💰 Jami: ${formatCurrency(totalAmount)}`;

        if (remainingAmount > 0) {
            messageText += `\n🔴 Qolgan: ${formatCurrency(remainingAmount)}`;
        } else {
            messageText += `\n✅ To'lov to'liq amalga oshirildi`;
        }

        const buttons = [];

        if (remainingAmount > 0) {
            buttons.push(Markup.button.callback("➕ Yana to'lov qo'shish", 'ADD_PAYMENT'));
        }

        if (payments.length > 0) {
            buttons.push(
                Markup.button.callback("🗑️ Oxirgi to'lovni o'chirish", 'REMOVE_LAST_PAYMENT'),
            );
        }

        if (isComplete) {
            buttons.push(Markup.button.callback('✅ Buyurtmani tasdiqlash', 'CONFIRM_ORDER'));
        }

        buttons.push(Markup.button.callback('🔙 Orqaga', 'BACK_TO_ORDER_SUMMARY'));
        buttons.push(Markup.button.callback('❌ Bekor qilish', 'CANCEL_ORDER'));

        await this.safeEditOrReply(
            ctx,
            messageText,
            Markup.inlineKeyboard(buttons, { columns: 1 }),
        );
    }

    @Action('ADD_PAYMENT')
    async onAddPayment(@Ctx() ctx: Context) {
        return this.showPaymentTypeSelection(ctx);
    }

    @Action('REMOVE_LAST_PAYMENT')
    async onRemoveLastPayment(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as NewOrderSceneState;

        if (!sceneState.payments || sceneState.payments.length === 0) {
            await this.safeEditOrReply(ctx, "❌ Hech qanday to'lov mavjud emas.");
            return this.showPaymentSummary(ctx);
        }

        const removedPayment = sceneState.payments.pop();
        sceneState.remainingAmount = this.calculateRemainingAmount(
            sceneState.totalAmount || 0,
            sceneState.payments,
        );

        const emoji = this.getPaymentTypeEmoji(removedPayment.type);
        const typeName = this.getPaymentTypeName(removedPayment.type);

        await this.safeEditOrReply(
            ctx,
            `🗑️ To'lov o'chirildi: ${emoji} ${typeName} - ${formatCurrency(removedPayment.amount)}`,
        );

        return this.showPaymentSummary(ctx);
    }

    @Action('RETRY_CATEGORIES')
    async onRetryCategories(@Ctx() ctx: Context) {
        return this.showProductTypes(ctx);
    }

    @Action('RETRY_SIDES')
    async onRetrySides(@Ctx() ctx: Context) {
        return this.showSidesSelection(ctx);
    }
}
