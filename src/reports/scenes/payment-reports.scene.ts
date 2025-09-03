import { Scene, SceneEnter, Action, Ctx } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';
import { ReportHelpers } from '../helpers/report.helpers';
import { Role } from '@prisma/client';
import { safeEditMessageText } from '../../utils/telegram.utils';
import { formatCurrency } from 'src/utils/format.utils';

@Scene('payment-reports-scene')
export class PaymentReportsScene {
    constructor(private readonly prisma: PrismaService) {}

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        await safeEditMessageText(
            ctx,
            "💳 To'lov turlari hisoboti\n\nDavrni tanlang:",
            Markup.inlineKeyboard(
                [
                    Markup.button.callback('📅 Bugun', 'PAYMENT_TODAY'),
                    Markup.button.callback('📈 Hafta', 'PAYMENT_WEEK'),
                    Markup.button.callback('📅 Oy', 'PAYMENT_MONTH'),
                    Markup.button.callback('📊 3 oy', 'PAYMENT_QUARTER'),
                    Markup.button.callback('🔙 Orqaga', 'BACK_TO_REPORTS'),
                ],
                {
                    columns: 2, // Har bir qatordagi tugmalar soni. 2 yoki 3 qilib o'zgartirishingiz mumkin.
                },
            ),
            "To'lov hisoboti",
        );
    }

    @Action('PAYMENT_TODAY')
    async generateTodayReport(@Ctx() ctx: Context) {
        await this.generatePaymentReport(ctx, 'today');
    }

    @Action('PAYMENT_WEEK')
    async generateWeekReport(@Ctx() ctx: Context) {
        await this.generatePaymentReport(ctx, 'week');
    }

    @Action('PAYMENT_MONTH')
    async generateMonthReport(@Ctx() ctx: Context) {
        await this.generatePaymentReport(ctx, 'month');
    }

    @Action('PAYMENT_QUARTER')
    async generateQuarterReport(@Ctx() ctx: Context) {
        await this.generatePaymentReport(ctx, 'quarter');
    }

    @Action('BACK_TO_REPORTS')
    async backToReports(@Ctx() ctx: Context) {
        await ctx.scene.leave();

        // Show the main reports menu
        const user = ctx.user;
        const reportButtons = [
            Markup.button.callback('📊 Umumiy', 'GENERAL_REPORTS'),
            Markup.button.callback("💳 To'lovlar", 'PAYMENT_REPORTS'),
        ];

        if (user.role === Role.SUPER_ADMIN) {
            reportButtons.push(
                Markup.button.callback('🏪 Filiallar', 'BRANCH_REPORTS'),
                Markup.button.callback('👥 Xodimlar', 'USER_REPORTS'),
            );
        }

        await safeEditMessageText(
            ctx,
            "📊 Hisobotlar bo'limi\n\nQaysi turdagi hisobotni ko'rmoqchisiz?",
            Markup.inlineKeyboard(reportButtons, {
                columns: 2,
            }),
            'Hisobotlar',
        );
    }

    private async generatePaymentReport(ctx: Context, period: string) {
        // Get user from database since ctx.user might not be available in scenes
        const telegramId = ctx.from?.id;
        if (!telegramId) {
            await safeEditMessageText(ctx, '❌ Telegram ID topilmadi.', undefined, 'Xatolik');
            return;
        }

        const user = await this.prisma.user.findUnique({
            where: { telegram_id: telegramId },
            include: { branch: true },
        });

        if (!user) {
            await safeEditMessageText(
                ctx,
                "❌ Siz tizimda ro'yxatdan o'tmagansiz.",
                undefined,
                'Xatolik',
            );
            return;
        }

        const { startDate, endDate, periodName } = ReportHelpers.getPeriodDates(period);
        let whereClause = {};

        if (user.role === Role.ADMIN && user.branch_id) {
            whereClause = { branch_id: user.branch_id };
        }

        // Get payment statistics from Payment model instead of Order
        const [paymentStats, totalRevenue] = await Promise.all([
            this.prisma.payment.groupBy({
                by: ['payment_type'],
                where: {
                    order: whereClause,
                    created_at: { gte: startDate, lt: endDate },
                },
                _count: true,
                _sum: { amount: true },
                _avg: { amount: true },
            }),
            this.prisma.payment.aggregate({
                where: {
                    order: whereClause,
                    created_at: { gte: startDate, lt: endDate },
                },
                _sum: { amount: true },
            }),
        ]);

        const paymentList = paymentStats
            .map((ps) => {
                const percentage = totalRevenue._sum.amount
                    ? ((ps._sum.amount / totalRevenue._sum.amount) * 100).toFixed(1)
                    : 0;
                return `💳 ${ReportHelpers.getPaymentEmoji(ps.payment_type)} ${ReportHelpers.capitalizeFirst(ps.payment_type)}:
  • To'lovlar: ${ps._count} ta
  • Daromad: ${formatCurrency(ps._sum.amount)} (${percentage}%)
  • O'rtacha: ${formatCurrency(Math.round(ps._avg.amount))}`;
            })
            .join('\n\n');

        const report = `
💳 ${periodName.toUpperCase()} TO'LOV TURLARI HISOBOTI

📊 Jami daromad: ${formatCurrency(totalRevenue._sum.amount) || 0}

${paymentList || "Ma'lumot yo'q"}

${user.role === Role.ADMIN ? `🏪 Filial: ${user.branch?.name || 'N/A'}` : '🌐 Barcha filiallar'}
    `;

        await safeEditMessageText(
            ctx,
            report,
            Markup.inlineKeyboard([Markup.button.callback('🔙 Orqaga', 'BACK_TO_REPORTS')]),
            'Hisobot',
        );
    }
}
