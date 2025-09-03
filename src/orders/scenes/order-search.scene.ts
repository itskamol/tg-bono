import { Scene, SceneEnter, On, Message, Ctx, Action } from 'nestjs-telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';
import { Markup } from 'telegraf';
import { Role } from '@prisma/client';
import { formatCurrency } from 'src/utils/format.utils';

@Scene('order-search-scene')
export class OrderSearchScene {
    constructor(private readonly prisma: PrismaService) {}

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        await ctx.reply(
            '🔍 Buyurtma qidirish',
            Markup.inlineKeyboard([
                [
                    Markup.button.callback("📅 Sana bo'yicha", 'search_by_date'),
                    Markup.button.callback('👤 Mijoz ismi', 'search_by_customer'),
                ],
                [
                    Markup.button.callback('🍕 Mahsulot nomi', 'search_by_product'),
                    Markup.button.callback('🔢 Buyurtma raqami', 'search_by_number'),
                ],
                [Markup.button.callback('❌ Bekor qilish', 'cancel_search')],
            ]),
        );
    }

    @Action('search_by_date')
    async onSearchByDate(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as any;
        sceneState.searchType = 'date';

        await ctx.editMessageText(
            '📅 Sanani tanlang:',
            Markup.inlineKeyboard([
                [
                    Markup.button.callback('📅 Bugun', 'date_today'),
                    Markup.button.callback('📅 Kecha', 'date_yesterday'),
                ],
                [
                    Markup.button.callback('📅 Bu hafta', 'date_this_week'),
                    Markup.button.callback('📅 Bu oy', 'date_this_month'),
                ],
                [Markup.button.callback('📝 Maxsus sana', 'date_custom')],
                [
                    Markup.button.callback('⬅️ Orqaga', 'back_to_search_menu'),
                    Markup.button.callback('❌ Bekor qilish', 'cancel_search'),
                ],
            ]),
        );
    }

    @Action('search_by_customer')
    async onSearchByCustomer(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as any;
        sceneState.searchType = 'customer';

        await ctx.editMessageText(
            '👤 Mijoz ismini kiriting:',
            Markup.inlineKeyboard([
                [
                    Markup.button.callback('⬅️ Orqaga', 'back_to_search_menu'),
                    Markup.button.callback('❌ Bekor qilish', 'cancel_search'),
                ],
            ]),
        );
    }

    @Action('search_by_product')
    async onSearchByProduct(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as any;
        sceneState.searchType = 'product';

        await ctx.editMessageText(
            '🍕 Mahsulot nomini kiriting:',
            Markup.inlineKeyboard([
                [
                    Markup.button.callback('⬅️ Orqaga', 'back_to_search_menu'),
                    Markup.button.callback('❌ Bekor qilish', 'cancel_search'),
                ],
            ]),
        );
    }

    @Action('search_by_number')
    async onSearchByNumber(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as any;
        sceneState.searchType = 'number';

        await ctx.editMessageText(
            '🔢 Buyurtma raqamini kiriting:',
            Markup.inlineKeyboard([
                [
                    Markup.button.callback('⬅️ Orqaga', 'back_to_search_menu'),
                    Markup.button.callback('❌ Bekor qilish', 'cancel_search'),
                ],
            ]),
        );
    }

    @Action(/^date_(.+)$/)
    async onDateSelection(@Ctx() ctx: Context) {
        const dateType = (ctx.callbackQuery as any).data.replace('date_', '');

        const startDate = new Date();
        let endDate = new Date();

        switch (dateType) {
            case 'today':
                startDate.setHours(0, 0, 0, 0);
                endDate.setHours(23, 59, 59, 999);
                break;
            case 'yesterday':
                startDate.setDate(startDate.getDate() - 1);
                startDate.setHours(0, 0, 0, 0);
                endDate.setDate(endDate.getDate() - 1);
                endDate.setHours(23, 59, 59, 999);
                break;
            case 'this_week':
                const dayOfWeek = startDate.getDay();
                startDate.setDate(startDate.getDate() - dayOfWeek);
                startDate.setHours(0, 0, 0, 0);
                endDate.setHours(23, 59, 59, 999);
                break;
            case 'this_month':
                startDate.setDate(1);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0);
                endDate.setHours(23, 59, 59, 999);
                break;
            case 'custom':
                const sceneState = ctx.scene.state as any;
                sceneState.waitingForCustomDate = true;
                await ctx.editMessageText(
                    '📅 Sanani kiriting (DD.MM.YYYY formatida, masalan: 25.12.2024):',
                    Markup.inlineKeyboard([
                        [
                            Markup.button.callback('⬅️ Orqaga', 'search_by_date'),
                            Markup.button.callback('❌ Bekor qilish', 'cancel_search'),
                        ],
                    ]),
                );
                return;
        }

        await this.performDateSearch(ctx, startDate, endDate);
    }

    @On('text')
    async onText(@Ctx() ctx: Context, @Message('text') text: string) {
        const sceneState = ctx.scene.state as any;

        if (sceneState.waitingForCustomDate) {
            const dateRegex = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
            const match = text.match(dateRegex);

            if (!match) {
                await ctx.reply(
                    "❌ Noto'g'ri sana formati. DD.MM.YYYY formatida kiriting (masalan: 25.12.2024)",
                );
                return;
            }

            const [, day, month, year] = match;
            const startDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
            startDate.setHours(0, 0, 0, 0);

            const endDate = new Date(startDate);
            endDate.setHours(23, 59, 59, 999);

            if (isNaN(startDate.getTime())) {
                await ctx.reply("❌ Noto'g'ri sana. Iltimos, to'g'ri sana kiriting.");
                return;
            }

            delete sceneState.waitingForCustomDate;
            await this.performDateSearch(ctx, startDate, endDate);
            return;
        }

        switch (sceneState.searchType) {
            case 'customer':
                await this.performCustomerSearch(ctx, text);
                break;
            case 'product':
                await this.performProductSearch(ctx, text);
                break;
            case 'number':
                await this.performNumberSearch(ctx, text);
                break;
        }
    }

    private async performDateSearch(ctx: Context, startDate: Date, endDate: Date) {
        const user = ctx.user;
        const whereClause: any = {
            created_at: {
                gte: startDate,
                lte: endDate,
            },
        };

        if (user.role === Role.ADMIN || user.role === Role.CASHIER) {
            if (!user.branch_id) {
                await ctx.reply('❌ Siz hech qanday filialga tayinlanmagansiz.');
                return;
            }
            whereClause.branch_id = user.branch_id;
        }

        await this.searchAndDisplayOrders(
            ctx,
            whereClause,
            `📅 ${startDate.toLocaleDateString('uz-UZ')} sanasidagi buyurtmalar`,
        );
    }

    private async performCustomerSearch(ctx: Context, customerName: string) {
        const user = ctx.user;
        const whereClause: any = {
            client_name: {
                contains: customerName,
                mode: 'insensitive',
            },
        };

        if (user.role === Role.ADMIN || user.role === Role.CASHIER) {
            if (!user.branch_id) {
                await ctx.reply('❌ Siz hech qanday filialga tayinlanmagansiz.');
                return;
            }
            whereClause.branch_id = user.branch_id;
        }

        await this.searchAndDisplayOrders(
            ctx,
            whereClause,
            `👤 "${customerName}" mijozining buyurtmalari`,
        );
    }

    private async performProductSearch(ctx: Context, productName: string) {
        const user = ctx.user;
        const whereClause: any = {
            order_products: {
                some: {
                    OR: [
                        {
                            product_name: {
                                contains: productName,
                                mode: 'insensitive',
                            },
                        },
                        {
                            side_name: {
                                contains: productName,
                                mode: 'insensitive',
                            },
                        },
                    ],
                },
            },
        };

        if (user.role === Role.ADMIN || user.role === Role.CASHIER) {
            if (!user.branch_id) {
                await ctx.reply('❌ Siz hech qanday filialga tayinlanmagansiz.');
                return;
            }
            whereClause.branch_id = user.branch_id;
        }

        await this.searchAndDisplayOrders(
            ctx,
            whereClause,
            `🍕 "${productName}" mahsuloti bo'lgan buyurtmalar`,
        );
    }

    private async performNumberSearch(ctx: Context, orderNumber: string) {
        const user = ctx.user;
        const whereClause: any = {
            order_number: {
                contains: orderNumber,
                mode: 'insensitive',
            },
        };

        if (user.role === Role.ADMIN || user.role === Role.CASHIER) {
            if (!user.branch_id) {
                await ctx.reply('❌ Siz hech qanday filialga tayinlanmagansiz.');
                return;
            }
            whereClause.branch_id = user.branch_id;
        }

        await this.searchAndDisplayOrders(
            ctx,
            whereClause,
            `🔢 "${orderNumber}" raqamli buyurtmalar`,
        );
    }

    private async searchAndDisplayOrders(ctx: Context, whereClause: any, title: string) {
        const orders = await this.prisma.order.findMany({
            where: whereClause,
            include: {
                branch: true,
                cashier: true,
                order_products: true,
                payments: true,
            },
            orderBy: { created_at: 'desc' },
            take: 20,
        });

        if (!orders || orders.length === 0) {
            await ctx.reply(
                "❌ Qidiruv bo'yicha buyurtmalar topilmadi.",
                Markup.inlineKeyboard([
                    [
                        Markup.button.callback('🔍 Qayta qidirish', 'back_to_search_menu'),
                        Markup.button.callback('❌ Chiqish', 'cancel_search'),
                    ],
                ]),
            );
            return;
        }

        const orderButtons = orders.map((order) =>
            Markup.button.callback(
                `${order.order_number} - ${formatCurrency(order.total_amount)}`,
                `VIEW_ORDER_${order.id}`,
            ),
        );

        // Add navigation buttons
        orderButtons.push(
            Markup.button.callback('🔍 Qayta qidirish', 'back_to_search_menu'),
            Markup.button.callback('❌ Chiqish', 'cancel_search'),
        );

        await ctx.reply(
            `${title} (${orders.length} ta topildi):`,
            Markup.inlineKeyboard(orderButtons, { columns: 1 }),
        );

        await ctx.scene.leave();
    }

    @Action('back_to_search_menu')
    async onBackToSearchMenu(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as any;
        delete sceneState.searchType;
        delete sceneState.waitingForCustomDate;

        await ctx.editMessageText(
            '🔍 Buyurtma qidirish',
            Markup.inlineKeyboard([
                [
                    Markup.button.callback("📅 Sana bo'yicha", 'search_by_date'),
                    Markup.button.callback('👤 Mijoz ismi', 'search_by_customer'),
                ],
                [
                    Markup.button.callback('🍕 Mahsulot nomi', 'search_by_product'),
                    Markup.button.callback('🔢 Buyurtma raqami', 'search_by_number'),
                ],
                [Markup.button.callback('❌ Bekor qilish', 'cancel_search')],
            ]),
        );
    }

    @Action('cancel_search')
    async onCancel(@Ctx() ctx: Context) {
        await ctx.editMessageText('❌ Qidiruv bekor qilindi.');
        await ctx.scene.leave();
    }
}
