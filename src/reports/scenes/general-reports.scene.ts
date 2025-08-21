import { Scene, SceneEnter, Action, Ctx } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';
import { Role } from '../../auth/enums/role.enum';
import { ReportHelpers } from '../helpers/report.helpers';

@Scene('general-reports-scene')
export class GeneralReportsScene {
    constructor(private readonly prisma: PrismaService) {}

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        await ctx.reply(
            '📊 Umumiy hisobotlar\n\nDavrni tanlang:',
            Markup.inlineKeyboard([
                Markup.button.callback('📅 Bugun', 'GENERAL_TODAY'),
                Markup.button.callback('📈 Hafta', 'GENERAL_WEEK'),
                Markup.button.callback('📅 Oy', 'GENERAL_MONTH'),
                Markup.button.callback('📊 3 oy', 'GENERAL_QUARTER'),
                Markup.button.callback('🔙 Orqaga', 'BACK_TO_REPORTS'),
            ]),
        );
    }

    @Action('GENERAL_TODAY')
    async generateTodayReport(@Ctx() ctx: Context) {
        await this.generateGeneralReport(ctx, 'today');
        await ctx.scene.leave();
    }

    @Action('GENERAL_WEEK')
    async generateWeekReport(@Ctx() ctx: Context) {
        await this.generateGeneralReport(ctx, 'week');
        await ctx.scene.leave();
    }

    @Action('GENERAL_MONTH')
    async generateMonthReport(@Ctx() ctx: Context) {
        await this.generateGeneralReport(ctx, 'month');
        await ctx.scene.leave();
    }

    @Action('GENERAL_QUARTER')
    async generateQuarterReport(@Ctx() ctx: Context) {
        await this.generateGeneralReport(ctx, 'quarter');
        await ctx.scene.leave();
    }

    @Action('BACK_TO_REPORTS')
    async backToReports(@Ctx() ctx: Context) {
        await ctx.scene.leave();
        // This will be handled by the main reports update
    }

    private async generateGeneralReport(ctx: Context, period: string) {
        // Get user from database since ctx.user might not be available in scenes
        const telegramId = ctx.from?.id;
        if (!telegramId) {
            await ctx.editMessageText('❌ Telegram ID topilmadi.');
            return;
        }

        const user = await this.prisma.user.findUnique({
            where: { telegram_id: telegramId },
            include: { branch: true },
        });

        if (!user) {
            await ctx.editMessageText("❌ Siz tizimda ro'yxatdan o'tmagansiz.");
            return;
        }

        const { startDate, endDate, periodName } = ReportHelpers.getPeriodDates(period);
        let whereClause = {};

        if (user.role === Role.ADMIN && user.branch_id) {
            whereClause = { branch_id: user.branch_id };
        }

        const [ordersCount, totalRevenue, avgOrderValue, topProducts] = await Promise.all([
            this.prisma.order.count({
                where: {
                    ...whereClause,
                    created_at: { gte: startDate, lt: endDate },
                },
            }),
            this.prisma.order.aggregate({
                where: {
                    ...whereClause,
                    created_at: { gte: startDate, lt: endDate },
                },
                _sum: { total_amount: true },
            }),
            this.prisma.order.aggregate({
                where: {
                    ...whereClause,
                    created_at: { gte: startDate, lt: endDate },
                },
                _avg: { total_amount: true },
            }),
            this.prisma.order_Product.groupBy({
                by: ['product_id'],
                where: {
                    order: {
                        ...whereClause,
                        created_at: { gte: startDate, lt: endDate },
                    },
                },
                _sum: { quantity: true },
                orderBy: { _sum: { quantity: 'desc' } },
                take: 5,
            }),
        ]);

        // Get product names for top products
        const productIds = topProducts.map((p) => p.product_id);
        const products = await this.prisma.product.findMany({
            where: { id: { in: productIds } },
        });

        const topProductsList = topProducts
            .map((tp) => {
                const product = products.find((p) => p.id === tp.product_id);
                return `• ${product?.name || 'N/A'}: ${tp._sum.quantity} ta`;
            })
            .join('\n');

        const report = `
📊 ${periodName.toUpperCase()} UMUMIY HISOBOT

📈 Asosiy ko'rsatkichlar:
• Buyurtmalar soni: ${ordersCount} ta
• Jami daromad: ${totalRevenue._sum.total_amount || 0} so'm
• O'rtacha buyurtma: ${Math.round(avgOrderValue._avg.total_amount || 0)} so'm

🔥 Eng ko'p sotilgan mahsulotlar:
${topProductsList || "Ma'lumot yo'q"}

${user.role === Role.ADMIN ? `🏪 Filial: ${user.branch?.name || 'N/A'}` : '🌐 Barcha filiallar'}
    `;

        await ctx.editMessageText(report);
    }
}
