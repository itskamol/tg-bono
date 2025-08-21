import { Scene, SceneEnter, Action, Ctx } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';
import { ReportHelpers } from '../helpers/report.helpers';
import { Role } from '@prisma/client';

@Scene('product-reports-scene')
export class ProductReportsScene {
    constructor(private readonly prisma: PrismaService) {}

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

        const [productStats, productTypeStats] = await Promise.all([
            this.prisma.order_Product.groupBy({
                by: ['product_id'],
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
            this.prisma.$queryRaw`
        SELECT 
          p.type,
          SUM(op.quantity) as total_quantity,
          SUM(op.price * op.quantity) as total_revenue,
          COUNT(DISTINCT op.order_id) as order_count
        FROM OrderProduct op
        JOIN Product p ON op.product_id = p.id
        JOIN \`Order\` o ON op.order_id = o.id
        WHERE o.created_at >= ${startDate} AND o.created_at < ${endDate}
        ${user.role === Role.ADMIN && user.branch_id ? `AND o.branch_id = '${user.branch_id}'` : ''}
        GROUP BY p.type
        ORDER BY total_quantity DESC
      `,
        ]);

        const productIds = productStats.map((p) => p.product_id);
        const products = await this.prisma.product.findMany({
            where: { id: { in: productIds } },
        });

        const productList = productStats
            .map((ps, index) => {
                const product = products.find((p) => p.id === ps.product_id);
                return `${index + 1}. ${product?.name || 'N/A'}:
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

        await ctx.editMessageText(report);
    }
}
