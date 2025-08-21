import { Scene, SceneEnter, Action, Ctx } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';
import { Role } from '../../auth/enums/role.enum';
import { ReportHelpers } from '../helpers/report.helpers';

@Scene('payment-reports-scene')
export class PaymentReportsScene {
    constructor(private readonly prisma: PrismaService) {}

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        await ctx.reply(
            "💳 To'lov turlari hisoboti\n\nDavrni tanlang:",
            Markup.inlineKeyboard([
                Markup.button.callback('📅 Bugun', 'PAYMENT_TODAY'),
                Markup.button.callback('📈 Hafta', 'PAYMENT_WEEK'),
                Markup.button.callback('📅 Oy', 'PAYMENT_MONTH'),
                Markup.button.callback('📊 3 oy', 'PAYMENT_QUARTER'),
                Markup.button.callback('🔙 Orqaga', 'BACK_TO_REPORTS'),
            ]),
        );
    }

    @Action('PAYMENT_TODAY')
    async generateTodayReport(@Ctx() ctx: Context) {
        await this.generatePaymentReport(ctx, 'today');
        await ctx.scene.leave();
    }

    @Action('PAYMENT_WEEK')
    async generateWeekReport(@Ctx() ctx: Context) {
        await this.generatePaymentReport(ctx, 'week');
        await ctx.scene.leave();
    }

    @Action('PAYMENT_MONTH')
    async generateMonthReport(@Ctx() ctx: Context) {
        await this.generatePaymentReport(ctx, 'month');
        await ctx.scene.leave();
    }

    @Action('PAYMENT_QUARTER')
    async generateQuarterReport(@Ctx() ctx: Context) {
        await this.generatePaymentReport(ctx, 'quarter');
        await ctx.scene.leave();
    }

    @Action('BACK_TO_REPORTS')
    async backToReports(@Ctx() ctx: Context) {
        await ctx.scene.leave();
    }

    private async generatePaymentReport(ctx: Context, period: string) {
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

        const [paymentStats, totalRevenue] = await Promise.all([
            this.prisma.order.groupBy({
                by: ['payment_type'],
                where: {
                    ...whereClause,
                    created_at: { gte: startDate, lt: endDate },
                },
                _count: true,
                _sum: { total_amount: true },
                _avg: { total_amount: true },
            }),
            this.prisma.order.aggregate({
                where: {
                    ...whereClause,
                    created_at: { gte: startDate, lt: endDate },
                },
                _sum: { total_amount: true },
            }),
        ]);

        const paymentList = paymentStats
            .map((ps) => {
                const percentage = totalRevenue._sum.total_amount
                    ? ((ps._sum.total_amount / totalRevenue._sum.total_amount) * 100).toFixed(1)
                    : 0;
                return `💳 ${ReportHelpers.getPaymentEmoji(ps.payment_type)} ${ReportHelpers.capitalizeFirst(ps.payment_type)}:
  • Buyurtmalar: ${ps._count} ta
  • Daromad: ${ps._sum.total_amount} so'm (${percentage}%)
  • O'rtacha: ${Math.round(ps._avg.total_amount)} so'm`;
            })
            .join('\n\n');

        const report = `
💳 ${periodName.toUpperCase()} TO'LOV TURLARI HISOBOTI

📊 Jami daromad: ${totalRevenue._sum.total_amount || 0} so'm

${paymentList || "Ma'lumot yo'q"}

${user.role === Role.ADMIN ? `🏪 Filial: ${user.branch?.name || 'N/A'}` : '🌐 Barcha filiallar'}
    `;

        await ctx.editMessageText(report);
    }
}
