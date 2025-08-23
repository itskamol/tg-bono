import { Scene, SceneEnter, Action, Ctx } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';
import { ReportHelpers } from '../helpers/report.helpers';
import { Role } from '@prisma/client';

@Scene('product-reports-scene')
export class ProductReportsScene {
    constructor(private readonly prisma: PrismaService) { }

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        await ctx.reply(
            '📦 Mahsulot hisoboti\n\nDavrni tanlang:',
            Markup.inlineKeyboard(
                [
                    Markup.button.callback('📅 Bugun', 'PRODUCT_TODAY'),
                    Markup.button.callback('📈 Hafta', 'PRODUCT_WEEK'),
                    Markup.button.callback('📅 Oy', 'PRODUCT_MONTH'),
                    Markup.button.callback('📊 3 oy', 'PRODUCT_QUARTER'),
                    Markup.button.callback('🔙 Orqaga', 'BACK_TO_REPORTS'),
                ],
                {
                    columns: 2, // Har bir qatordagi tugmalar soni. 2 yoki 3 qilib o'zgartirishingiz mumkin.
                },
            ),
        );
    }

    @Action('PRODUCT_TODAY')
    async generateTodayReport(@Ctx() ctx: Context) {
        await this.generateProductReport(ctx, 'today');
        await ctx.scene.leave();
    }

    @Action('PRODUCT_WEEK')
    async generateWeekReport(@Ctx() ctx: Context) {
        await this.generateProductReport(ctx, 'week');
        await ctx.scene.leave();
    }

    @Action('PRODUCT_MONTH')
    async generateMonthReport(@Ctx() ctx: Context) {
        await this.generateProductReport(ctx, 'month');
        await ctx.scene.leave();
    }

    @Action('PRODUCT_QUARTER')
    async generateQuarterReport(@Ctx() ctx: Context) {
        await this.generateProductReport(ctx, 'quarter');
        await ctx.scene.leave();
    }

    @Action('BACK_TO_REPORTS')
    async backToReports(@Ctx() ctx: Context) {
        await ctx.scene.leave();
    }

    private async generateProductReport(ctx: Context, period: string) {
        // Get user from database since ctx.user might not be available in scenes
        const telegramId = ctx.from?.id;
        if (!telegramId) {
            await ctx.reply('❌ Telegram ID topilmadi.');
            return;
        }

        const user = await this.prisma.user.findUnique({
            where: { telegram_id: telegramId },
            include: { branch: true },
        });

        if (!user) {
            await ctx.reply("❌ Siz tizimda ro'yxatdan o'tmagansiz.");
            return;
        }

        const { startDate, endDate, periodName } = ReportHelpers.getPeriodDates(period);
        let whereClause = {};

        if (user.role === Role.ADMIN && user.branch_id) {
            whereClause = { branch_id: user.branch_id };
        }

        const [productStats, productTypeStats] = await Promise.all([
            this.prisma.order_Product.groupBy({
                by: ['product_name'],
                where: {
                    order: {
                        ...whereClause,
                        created_at: { gte: startDate, lt: endDate },
                    },
                },
                _sum: {
                    quantity: true,
                    price: true,
                },
                _count: true,
                orderBy: { _sum: { quantity: 'desc' } },
                take: 10,
            }),
            this.getProductTypeStats(startDate, endDate, user.branch_id),
        ]);

        const productList = productStats
            .map((ps, index) => {
                return `${index + 1}. ${ps.product_name}:
  • Sotildi: ${ps._sum.quantity} ta
  • Daromad: ${ps._sum.price} so'm
  • Buyurtmalar: ${ps._count} ta`;
            })
            .join('\n\n');

        const typeList = (productTypeStats as any[])
            .map(
                (ts) =>
                    `${ReportHelpers.getTypeEmoji(ts.type)} ${ReportHelpers.capitalizeFirst(ts.type)}:
  • Sotildi: ${ts.total_quantity} ta
  • Daromad: ${ts.total_revenue} so'm`,
            )
            .join('\n\n');

        const report = `
📦 ${periodName.toUpperCase()} MAHSULOT HISOBOTI

🏆 Eng ko'p sotilgan mahsulotlar:
${productList || "Ma'lumot yo'q"}

📊 Tur bo'yicha statistika:
${typeList || "Ma'lumot yo'q"}

${user.role === Role.ADMIN ? `🏪 Filial: ${user.branch?.name || 'N/A'}` : '🌐 Barcha filiallar'}
    `;

        await ctx.reply(report);
    }

    private async getProductTypeStats(startDate: Date, endDate: Date, branchId?: string) {
        // Get all orders in the date range
        const whereClause: any = {
            created_at: {
                gte: startDate,
                lt: endDate,
            },
        };

        if (branchId) {
            whereClause.branch_id = branchId;
        }

        const orders = await this.prisma.order.findMany({
            where: whereClause,
            include: {
                order_products: true,
            },
        });

        // Group by category and calculate stats
        const typeStats: { [key: string]: { total_quantity: number; total_revenue: number; order_count: Set<string> } } = {};

        orders.forEach(order => {
            order.order_products.forEach(orderProduct => {
                const type = orderProduct.category;

                if (!typeStats[type]) {
                    typeStats[type] = {
                        total_quantity: 0,
                        total_revenue: 0,
                        order_count: new Set(),
                    };
                }

                typeStats[type].total_quantity += orderProduct.quantity;
                typeStats[type].total_revenue += orderProduct.price * orderProduct.quantity;
                typeStats[type].order_count.add(order.id);
            });
        });

        // Convert to array format
        return Object.entries(typeStats).map(([type, stats]) => ({
            type,
            total_quantity: stats.total_quantity,
            total_revenue: stats.total_revenue,
            order_count: stats.order_count.size,
        })).sort((a, b) => b.total_quantity - a.total_quantity);
    }
}
