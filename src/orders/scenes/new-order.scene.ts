import { Scene, SceneEnter, On, Message, Action, Ctx } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../../notifications/notification.service';
import { Context } from '../../interfaces/context.interface';
import { PaymentType } from '@prisma/client';
import { formatCurrency } from 'src/utils/format.utils';
import { GoogleSheetsService } from '../../sheets/google-sheets.service';
import { EncryptionService } from '../../settings/encryption.service';

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
    constructor(
        private readonly prisma: PrismaService,
        private readonly notificationService: NotificationService,
        private readonly googleSheetsService: GoogleSheetsService,
        private readonly encryptionService: EncryptionService,
    ) { }

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
            "🛒 <b>Yangi buyurtma yaratish</b>\n\n👤 Mijozning ismini kiriting:",
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
                `✅ Mijoz ismi: <b>${text}</b>\n\n📞 Mijozning telefon raqamini kiriting:`,
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
                `✅ Telefon: <b>${text}</b>\n\n🎂 Mijozning tug'ilgan kunini kiriting (<code>YYYY-MM-DD</code>):`,
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
                    "❌ Noto'g'ri sana formati. <code>YYYY-MM-DD</code> formatida kiriting (masalan: <code>1990-05-15</code>):",
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
                `✅ Tug'ilgan kun: <b>${text}</b>\n\n📦 Endi mahsulot qo'shamiz.`,
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
                    `✅ Mahsulot nomi: <b>${text}</b>\n\n💰 Narxini kiriting (so'mda):`,
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
                `✅ "<b>${productName}</b>" qo'shildi.\n💰 Narx: <b>${formatCurrency(price)}</b>`,
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
                return `${i + 1}. ${p.quantity}x <b>${p.name}</b>${sideInfo} - <b>${formatCurrency(p.price * p.quantity)}</b>`;
            })
            .join('\n');

        const messageText = `✅ <b>Mahsulot qo'shildi!</b>

📦 <b>Joriy mahsulotlar:</b>
${productsList}

💰 <b>Jami:</b> ${formatCurrency(total)}

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
            `⏭️ Telefon raqami o'tkazib yuborildi.\n\n🎂 Mijozning tug'ilgan kunini kiriting (<code>YYYY-MM-DD</code>):`,
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
                '📦 <b>Mahsulot kategoriyasini tanlang:</b>',
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
                '🔧 <b>Custom mahsulot tanlandi.</b>\n\n📝 Mahsulot nomini kiriting:',
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
                `"<b>${category.name}</b>" kategoriyasi tanlandi.\n\n📝 Mahsulot nomini kiriting:`,
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
            `✅ "<b>${sceneState.currentProduct.name}</b>" (${side.name}) qo'shildi.\n💰 Narx: <b>${formatCurrency(side.price)}</b>`,
        );

        sceneState.currentProduct = {};
        await this.showOrderSummary(ctx);
    }

    @Action('BACK_TO_TYPES')
    async onBackToTypes(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as NewOrderSceneState;
        // Reset current product state
        sceneState.currentProduct = {};
        sceneState.awaitingProductName = false;
        sceneState.awaitingProductPrice = false;
        sceneState.isCustomProduct = false;
        return this.showProductTypes(ctx);
    }

    @Action('RETRY_CATEGORIES')
    async onRetryCategories(@Ctx() ctx: Context) {
        return this.showProductTypes(ctx);
    }

    @Action('RETRY_SIDES')
    async onRetrySides(@Ctx() ctx: Context) {
        return this.showSidesSelection(ctx);
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
                return `${i + 1}. ${p.quantity}x <b>${p.name}</b>${sideInfo} - <b>${formatCurrency(p.price * p.quantity)}</b>`;
            })
            .join('\n');

        const paymentsText = this.formatPaymentsList(sceneState.payments || []);

        const orderSummary = `📋 <b>Buyurtmani tasdiqlang:</b>

👤 <b>Mijoz:</b> ${sceneState.clientName}
📞 <b>Telefon:</b> ${sceneState.clientPhone || "Ko'rsatilmagan"}
${sceneState.clientBirthday ? `🎂 <b>Tug'ilgan kun:</b> ${sceneState.clientBirthday.toLocaleDateString('uz-UZ')}` : ''}

📦 <b>Mahsulotlar:</b>
${productsList}

💳 <b>To'lovlar:</b>
${paymentsText}

💰 <b>Jami:</b> ${formatCurrency(sceneState.totalAmount)}`;

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
            const createdOrder = await this.prisma.$transaction(async (prisma) => {
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
                    include: {
                        order_products: true,
                        branch: true,
                        cashier: true,
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

                return order;
            });

            // Kanal/guruhga notification yuborish
            try {
                await this.notificationService.sendOrderNotification({
                    orderNumber: createdOrder.order_number,
                    clientName: createdOrder.client_name,
                    clientPhone: createdOrder.client_phone,
                    branchName: createdOrder.branch.name,
                    cashierName: createdOrder.cashier?.full_name || 'Noma\'lum',
                    products: createdOrder.order_products.map(p => ({
                        productName: p.product_name,
                        category: p.category,
                        sideName: p.side_name,
                        quantity: p.quantity,
                        price: p.price,
                    })),
                    payments: sceneState.payments?.map(p => ({
                        paymentType: p.type,
                        amount: p.amount,
                    })) || [],
                    totalAmount: createdOrder.total_amount,
                    createdAt: createdOrder.created_at,
                });
            } catch (notificationError) {
                console.error('Notification yuborishda xatolik:', notificationError);
                // Notification xatosi order yaratish jarayonini to'xtatmaydi
            }

            const paymentsText = this.formatPaymentsList(sceneState.payments || []);

            // Foydalanuvchiga darhol javob berish
            await this.safeEditOrReply(
                ctx,
                `✅ <b>Buyurtma muvaffaqiyatli yaratildi!</b>\n\n🔢 Buyurtma raqami: <code>${orderNumber}</code>\n\n💳 <b>To'lovlar:</b>\n${paymentsText}\n\n💰 <b>Jami: ${formatCurrency(sceneState.totalAmount)}</b> \n\nRahmat!`,
                Markup.inlineKeyboard([
                    Markup.button.callback('🆕 Yangi buyurtma', 'START_NEW_ORDER'),
                ]),
            );
            await ctx.scene.leave();

            // Google Sheets'ga yozishni background'da bajarish (kutmasdan)
            this.writeOrderToSheets(createdOrder).catch(sheetsError => {
                console.error('Google Sheets\'ga yozishda xatolik:', sheetsError);
                // Sheets xatosi order yaratish jarayonini to'xtatmaydi
            });
        } catch (error) {
            let errorMessage = '❌ <b>Buyurtma yaratishda xatolik yuz berdi.</b>';

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
                `⚠️ Siz <b>${sceneState.payments.length}</b> ta to'lov qo'shgansiz.\n\nHaqiqatan ham buyurtmani bekor qilmoqchimisiz?`,
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
            await ctx.editMessageText(text, { parse_mode: 'HTML', ...extra });
        } catch (error) {
            await ctx.reply(text, { parse_mode: 'HTML', ...extra });
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
                `📦 "<b>${sceneState.currentProduct.name}</b>" tanlandi\n\n🔲 Tomonni tanlang (narx = tomon narxi):`,
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
                error: `❌ Kiritilgan miqdor qolgan summadan ko'p.\nMaksimal: <b>${formatCurrency(remainingAmount)}</b>`,
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
                return `${index + 1}. ${emoji} ${typeName}: <b>${formatCurrency(payment.amount)}</b>`;
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
            `💳 <b>To'lov turi tanlang</b>\n\n💰 Qolgan summa: <b>${formatCurrency(remainingAmount)}</b>`,
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
            `${emoji} <b>${typeName}</b> to'lov tanlandi\n\n💰 Qolgan summa: <b>${formatCurrency(remainingAmount)}</b> \n\n💵 To'lov miqdorini kiriting:`,
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

        let messageText = `💳 <b>To'lov xulosasi:</b>\n\n${paymentsText}\n\n💰 <b>Jami:</b> ${formatCurrency(totalAmount)}`;

        if (remainingAmount > 0) {
            messageText += `\n🔴 <b>Qolgan:</b> ${formatCurrency(remainingAmount)}`;
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
            `🗑️ To'lov o'chirildi: ${emoji} <b>${typeName}</b> - <b>${formatCurrency(removedPayment.amount)}</b>`,
        );

        return this.showPaymentSummary(ctx);
    }

    private async writeOrderToSheets(order: any) {
        try {
            // Google Sheets sozlamalarini olish
            const gSheetsConfig = await this.prisma.setting.findUnique({
                where: { key: 'g_sheets_config' },
            });

            if (!gSheetsConfig) {
                console.log('Google Sheets sozlamalari topilmadi');
                return;
            }

            const decryptedConfig = this.encryptionService.decrypt(gSheetsConfig.value);
            const config = JSON.parse(decryptedConfig);

            // Avtomatik yozish o'chirilgan bo'lsa, yozmaymiz
            if (config.autoWrite === false) {
                console.log('Google Sheets avtomatik yozish o\'chirilgan');
                return;
            }

            // To'lovlarni olish
            const payments = await this.prisma.payment.findMany({
                where: { order_id: order.id },
            });

            // Batafsil mahsulotlar ro'yxati
            const detailedProducts = order.order_products.map((p, index) => {
                const sideInfo = p.side_name !== 'custom' ? ` (${p.side_name})` : '';
                return `${index + 1}. ${p.quantity}x ${p.product_name}${sideInfo} - ${this.formatCurrency(p.price * p.quantity)}`;
            }).join('\n');

            // Batafsil to'lovlar ro'yxati
            const detailedPayments = payments.map((p, index) => {
                const paymentName = this.getPaymentTypeName(p.payment_type as PaymentType);
                return `${index + 1}. ${paymentName}: ${this.formatCurrency(p.amount)}`;
            }).join('\n');

            // Kategoriyalar ro'yxati
            const categories = order.order_products.map(p => p.category).join(', ');

            // Tomonlar ro'yxati
            const sides = order.order_products
                .filter(p => p.side_name && p.side_name !== 'custom')
                .map(p => p.side_name)
                .join(', ');

            // Google Sheets'ga yozish uchun batafsil object
            const orderObject = {
                'Order Number': order.order_number,
                'Client Name': order.client_name,
                'Client Phone': order.client_phone || 'Ko\'rsatilmagan',
                'Branch': order.branch.name,
                'Cashier': order.cashier?.full_name || 'Noma\'lum',
                'Total Amount': order.total_amount,
                'Created At': new Date(order.created_at).toLocaleString('uz-UZ'),
                'Products Count': order.order_products.length,
                'Products Detail': detailedProducts,
                'Categories': categories,
                'Sides': sides || 'Yo\'q',
                'Payments Count': payments.length,
                'Payments Detail': detailedPayments,
                'Status': 'Completed'
            };

            // appendData methodini ishlatib haqiqiy yozish
            const result = await this.googleSheetsService.appendData(
                config.sheetId,
                config.credentials,
                [orderObject], // Object array
                'Orders' // Default worksheet nomi
            );

            // if (result) {
            //     console.log(`✅ Order ${order.order_number} Google Sheets'ga batafsil ma'lumot bilan yozildi`);
            // } else {
            //     console.log(`❌ Order ${order.order_number} Google Sheets'ga yozilmadi`);
            // }
        } catch (error) {
            console.error('Google Sheets\'ga yozishda xatolik:', error);
            // Xatolik bo'lsa ham order yaratish jarayonini to'xtatmaymiz
        }
    }

    // Helper methodlar
    private formatCurrency(amount: number): string {
        return new Intl.NumberFormat('uz-UZ', {
            style: 'currency',
            currency: 'UZS',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(amount).replace('UZS', 'so\'m');
    }


}
