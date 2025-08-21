import { Scene, SceneEnter, Action, Ctx } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';
import { ReportHelpers } from '../helpers/report.helpers';
import { Prisma, Role } from '@prisma/client';

@Scene('revenue-reports-scene')
export class RevenueReportsScene {
    constructor(private readonly prisma: PrismaService) {}

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        await ctx.reply(
            '💰 Daromad hisoboti\n\nDavrni tanlang:',
            Markup.inlineKeyboard(
                [
                    Markup.button.callback('📅 Bugun', 'REVENUE_TODAY'),
                    Markup.button.callback('📈 Hafta', 'REVENUE_WEEK'),
                    Markup.button.callback('📅 Oy', 'REVENUE_MONTH'),
                    Markup.button.callback('📊 3 oy', 'REVENUE_QUARTER'),
                    Markup.button.callback('🔙 Orqaga', 'BACK_TO_REPORTS'),
                ],
                {
                    columns: 2,
                },
            ),
        );
    }

    @Action('REVENUE_TODAY')
    async generateTodayReport(@Ctx() ctx: Context) {
        await this.generateRevenueReport(ctx, 'today');
        await ctx.scene.leave();
    }

    @Action('REVENUE_WEEK')
    async generateWeekReport(@Ctx() ctx: Context) {
        await this.generateRevenueReport(ctx, 'week');
        await ctx.scene.leave();
    }

    @Action('REVENUE_MONTH')
    async generateMonthReport(@Ctx() ctx: Context) {
        await this.generateRevenueReport(ctx, 'month');
        await ctx.scene.leave();
    }

    @Action('REVENUE_QUARTER')
    async generateQuarterReport(@Ctx() ctx: Context) {
        await this.generateRevenueReport(ctx, 'quarter');
        await ctx.scene.leave();
    }

    @Action('BACK_TO_REPORTS')
    async backToReports(@Ctx() ctx: Context) {
        await ctx.scene.leave();
    }

    private async generateRevenueReport(ctx: Context, period: string) {
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
        const whereClause: Prisma.OrderWhereInput = {
            created_at: {
                gte: startDate,
                lt: endDate,
            },
        };

        if (user.role === Role.ADMIN && user.branch_id) {
            whereClause.branch_id = user.branch_id;
        }

        const revenueData = await this.prisma.order.groupBy({
            by: ['created_at'],
            where: whereClause,
            _sum: {
                total_amount: true,
            },
            _count: {
                _all: true,
            },
            _avg: {
                total_amount: true,
            },
            orderBy: {
                created_at: 'desc',
            },
            take: 15,
        });

        if (revenueData.length === 0) {
            await ctx.editMessageText(`Sizda ${periodName} davr uchun ma'lumotlar mavjud emas.`);
            return;
        }

        const revenueList = revenueData
            .map((day) => {
                const dailyRevenue = day._sum.total_amount ?? 0;
                const dailyOrders = day._count._all ?? 0;
                const avgOrderValue = day._avg.total_amount ?? 0;
                return `📅 ${new Date(day.created_at).toLocaleDateString('uz-UZ')}:
  • Daromad: ${dailyRevenue} so'm
  • Buyurtmalar: ${dailyOrders} ta
  • O'rtacha: ${Math.round(avgOrderValue)} so'm`;
            })
            .join('\n\n');

        const totalRevenue = revenueData.reduce(
            (sum, day) => sum + (day._sum.total_amount ?? 0),
            0,
        );
        const totalOrders = revenueData.reduce((sum, day) => sum + (day._count._all ?? 0), 0);
        const avgDaily = Math.round(totalRevenue / revenueData.length);

        const branchName = user.branch?.name ?? 'N/A';
        const report = `
💰 ${periodName.toUpperCase()} DAROMAD HISOBOTI

📊 Umumiy ko'rsatkichlar:
• Jami daromad: ${totalRevenue} so'm
• Jami buyurtmalar: ${totalOrders} ta
• Kunlik o'rtacha: ${avgDaily} so'm

📅 Kunlik taqsimot:
${revenueList || "Ma'lumot yo'q"}

${user.role === Role.ADMIN ? `🏪 Filial: ${branchName}` : '🌐 Barcha filiallar'}
    `;

        await ctx.editMessageText(report);
    }
}
