import { Update, Command, Ctx, Action } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { Roles } from '../auth/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { Context } from '../interfaces/context.interface';
import { Order, PaymentType, Role } from '@prisma/client';
import { safeEditMessageText } from '../utils/telegram.utils';
import { formatCurrency } from 'src/utils/format.utils';

@Update()
export class OrdersUpdate {
    constructor(private readonly prisma: PrismaService) {}

    @Command('neworder')
    @Roles(Role.CASHIER)
    async onNewOrder(@Ctx() ctx: Context) {
        if (!ctx.user.branch_id) {
            await ctx.reply(
                '❌ Siz hech qanday filialga tayinlanmagansiz. Buyurtma yarata olmaysiz.',
            );
            return;
        }
        await ctx.scene.enter('new-order-scene');
    }

    @Command('search_orders')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.CASHIER)
    async searchOrders(@Ctx() ctx: Context) {
        await ctx.scene.enter('order-search-scene');
    }

    @Command('orders')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.CASHIER)
    async listOrders(@Ctx() ctx: Context) {
        const user = ctx.user;
        let orders: Order[] = [];
        let whereClause: any = {};

        // Filiallarga qarab filter qilish
        if (user.role === Role.ADMIN || user.role === Role.CASHIER) {
            if (!user.branch_id) {
                await ctx.reply('❌ Siz hech qanday filialga tayinlanmagansiz.');
                return;
            }
            whereClause.branch_id = user.branch_id;
        }
        // SUPER_ADMIN uchun whereClause bo'sh qoladi (barcha filiallar)

        orders = await this.prisma.order.findMany({
            where: whereClause,
            include: {
                branch: true,
                cashier: true,
                order_products: true,
                payments: true,
            },
            orderBy: { created_at: 'desc' },
            take: 10,
        });

        if (!orders || orders.length === 0) {
            const branchInfo = user.role === Role.SUPER_ADMIN ? 'tizimda' : `"${user.branch?.name || 'sizning filialingizda'}"`;
            await ctx.reply(`❌ ${branchInfo} buyurtmalar topilmadi.`);
            return;
        }

        const orderButtons = orders.map((order) =>
            Markup.button.callback(
                `${order.order_number} - ${formatCurrency(order.total_amount)}`,
                `VIEW_ORDER_${order.id}`,
            ),
        );

        // Add search button at the end
        orderButtons.push(Markup.button.callback('🔍 Qidirish', 'SEARCH_ORDERS'));

        const branchInfo = user.role === Role.SUPER_ADMIN ? 'Barcha filiallar' : `Filial: ${user.branch?.name || 'N/A'}`;
        
        await safeEditMessageText(
            ctx,
            `📋 Buyurtmalar (${orders.length} ta)\n🏪 ${branchInfo}:`,
            Markup.inlineKeyboard(orderButtons, { columns: 1 }),
        );
    }

    @Command('user_orders')
    @Roles(Role.SUPER_ADMIN)
    async userOrderHistory(@Ctx() ctx: Context) {
        const message = ctx.message;
        if (!('text' in message)) return;
        
        const args = message.text.split(' ');
        if (args.length < 2) {
            await ctx.reply('📋 Foydalanish: /user_orders [user_id yoki telegram_id]\n\nMisol: /user_orders 123456789');
            return;
        }

        const userIdentifier = args[1];
        let targetUser;

        // Telegram ID yoki User ID orqali qidirish
        if (userIdentifier.length > 10) {
            // Telegram ID
            targetUser = await this.prisma.user.findUnique({
                where: { telegram_id: parseInt(userIdentifier) },
                include: { branch: true }
            });
        } else {
            // User ID
            targetUser = await this.prisma.user.findUnique({
                where: { id: userIdentifier },
                include: { branch: true }
            });
        }

        if (!targetUser) {
            await ctx.reply('❌ Foydalanuvchi topilmadi.');
            return;
        }

        // Barcha filiallardan orderlarni olish
        const orders = await this.prisma.order.findMany({
            where: { cashier_id: targetUser.id },
            include: {
                branch: true,
                order_products: true,
                payments: true,
            },
            orderBy: { created_at: 'desc' },
            take: 20,
        });

        if (orders.length === 0) {
            await ctx.reply(`❌ ${targetUser.full_name} uchun buyurtmalar topilmadi.`);
            return;
        }

        // Filial bo'yicha guruhlash
        const ordersByBranch = orders.reduce((acc, order) => {
            const branchName = order.branch.name;
            if (!acc[branchName]) {
                acc[branchName] = [];
            }
            acc[branchName].push(order);
            return acc;
        }, {} as Record<string, typeof orders>);

        let responseMessage = `👤 ${targetUser.full_name} ning buyurtmalari:\n🏪 Joriy filial: ${targetUser.branch?.name || 'Tayinlanmagan'}\n\n`;

        Object.entries(ordersByBranch).forEach(([branchName, branchOrders]) => {
            const totalAmount = branchOrders.reduce((sum, order) => sum + order.total_amount, 0);
            responseMessage += `🏢 ${branchName} (${branchOrders.length} ta - ${formatCurrency(totalAmount)}):\n`;
            
            branchOrders.slice(0, 5).forEach(order => {
                responseMessage += `  • ${order.order_number} - ${formatCurrency(order.total_amount)} (${order.created_at.toLocaleDateString('uz-UZ')})\n`;
            });
            
            if (branchOrders.length > 5) {
                responseMessage += `  ... va yana ${branchOrders.length - 5} ta\n`;
            }
            responseMessage += '\n';
        });

        await ctx.reply(responseMessage);
    }

    @Command('order_stats')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN)
    async orderStats(@Ctx() ctx: Context) {
        const user = ctx.user;
        let whereClause = {};

        if (user.role === Role.ADMIN && user.branch_id) {
            whereClause = { branch_id: user.branch_id };
        }
        // SUPER_ADMIN uchun whereClause bo'sh qoladi (barcha filiallar)

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const [todayOrders, totalOrders, todayRevenue, totalRevenue] = await Promise.all([
            this.prisma.order.count({
                where: {
                    ...whereClause,
                    created_at: {
                        gte: today,
                        lt: tomorrow,
                    },
                },
            }),
            this.prisma.order.count({ where: whereClause }),
            this.prisma.order.aggregate({
                where: {
                    ...whereClause,
                    created_at: {
                        gte: today,
                        lt: tomorrow,
                    },
                },
                _sum: { total_amount: true },
            }),
            this.prisma.order.aggregate({
                where: whereClause,
                _sum: { total_amount: true },
            }),
        ]);

        const statsMessage = `
📊 Buyurtma statistikasi:

📅 Bugun:
• Buyurtmalar: ${todayOrders} ta
• Daromad: ${formatCurrency(todayRevenue._sum.total_amount) || 0}

📈 Jami:
• Buyurtmalar: ${totalOrders} ta  
• Daromad: ${formatCurrency(totalRevenue._sum.total_amount) || 0}

${user.role === Role.ADMIN ? `🏪 Filial: ${user.branch?.name || 'N/A'}` : '🌐 Barcha filiallar'}
    `;

        await ctx.reply(statsMessage);
    }

    @Action('SEARCH_ORDERS')
    async onSearchOrdersAction(@Ctx() ctx: Context) {
        await ctx.answerCbQuery();
        await ctx.scene.enter('order-search-scene');
    }

    @Action('BACK_TO_ORDERS')
    async onBackToOrders(@Ctx() ctx: Context) {
        await ctx.answerCbQuery();
        return this.listOrders(ctx);
    }

    @Action('START_NEW_ORDER')
    @Roles(Role.CASHIER)
    async onStartNewOrderAction(@Ctx() ctx: Context) {
        await ctx.answerCbQuery();

        if (!ctx.user.branch_id) {
            await safeEditMessageText(
                ctx,
                '❌ Siz hech qanday filialga tayinlanmagansiz. Buyurtma yarata olmaysiz.',
                undefined,
                'Xatolik',
            );
            return;
        }

        await ctx.scene.enter('new-order-scene');
    }

    @Action(/^VIEW_ORDER_(.+)$/)
    async onViewOrder(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) {
            return;
        }
        const orderData = ctx.callbackQuery.data;
        const orderId = orderData.replace('VIEW_ORDER_', '');

        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: {
                branch: true,
                cashier: true,
                payments: true,
                order_products: true,
            },
        });

        if (!order) {
            await safeEditMessageText(
                ctx,
                '❌ Buyurtma topilmadi.',
                undefined,
                'Buyurtma topilmadi',
            );
            return;
        }

        const products = order.order_products
            .map(
                (op) =>
                    `• ${op.quantity}x ${op.product_name} (${op.side_name}) - ${formatCurrency(op.price * op.quantity)}`,
            )
            .join('\n');

        // Format payments display
        const paymentsText =
            order.payments && order.payments.length > 0
                ? order.payments
                      .map((payment, index) => {
                          const emoji =
                              {
                                  [PaymentType.CASH]: '💵',
                                  [PaymentType.CARD]: '💳',
                                  [PaymentType.TRANSFER]: '📱',
                              }[payment.payment_type] || '💰';

                          const typeName =
                              {
                                  [PaymentType.CASH]: 'Naqd',
                                  [PaymentType.CARD]: 'Karta',
                                  [PaymentType.TRANSFER]: 'Nasiya',
                              }[payment.payment_type] || "Noma'lum";

                          return `${index + 1}. ${emoji} ${typeName}: ${formatCurrency(payment.amount)}`;
                      })
                      .join('\n')
                : "To'lov ma'lumotlari mavjud emas";

        const orderDetails = `
📋 Buyurtma tafsilotlari:

🔢 Raqam: ${order.order_number}
👤 Mijoz: ${order.client_name}
📞 Telefon: ${order.client_phone || "Ko'rsatilmagan"}
${order.client_birthday ? `🎂 Tug'ilgan kun: ${order.client_birthday.toLocaleDateString('uz-UZ')}` : ''}

🏪 Filial: ${order.branch.name}
💰 Kassir: ${order.cashier?.full_name || 'Noma\'lum'}

💳 To'lovlar:
${paymentsText}

📦 Mahsulotlar:
${products}

💵 Jami: ${formatCurrency(order.total_amount)}
📅 Sana: ${order.created_at.toLocaleString('uz-UZ')}
    `;

        await safeEditMessageText(
            ctx,
            orderDetails,
            Markup.inlineKeyboard([
                Markup.button.callback("🔙 Buyurtmalar ro'yxatiga qaytish", 'BACK_TO_ORDERS'),
            ]),
            'Buyurtma tafsilotlari',
        );
    }
}
