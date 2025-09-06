import { Scene, SceneEnter, Action, Ctx } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';
import { ReportHelpers } from '../helpers/report.helpers';
import { ReportFormatter, ReportSummary, PaymentReportData } from '../helpers/report-formatter.helper';
import { Role } from '@prisma/client';
import { safeEditMessageText } from '../../utils/telegram.utils';

@Scene('payment-reports-scene')
export class PaymentReportsScene {
    constructor(private readonly prisma: PrismaService) { }

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        const menuText = `🏦 <b>TO'LOV TURLARI HISOBOTI</b> 🏦\n\nQaysi davr uchun hisobot kerak?`;

        await safeEditMessageText(
            ctx,
            menuText,
            Markup.inlineKeyboard(
                [
                    Markup.button.callback('📅 Bugun', 'PAYMENT_TODAY'),
                    Markup.button.callback('📈 Hafta', 'PAYMENT_WEEK'),
                    Markup.button.callback('📅 Oy', 'PAYMENT_MONTH'),
                    Markup.button.callback('📊 3 oy', 'PAYMENT_QUARTER'),
                    Markup.button.callback('📋 Batafsil', 'PAYMENT_DETAILED'),
                    Markup.button.callback('🔙 Orqaga', 'BACK_TO_REPORTS'),
                ],
                {
                    columns: 2,
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

    @Action('PAYMENT_DETAILED')
    async generateDetailedReport(@Ctx() ctx: Context) {
        await this.generatePaymentReport(ctx, 'month', true);
    }

    @Action('BACK_TO_REPORTS')
    async backToReports(@Ctx() ctx: Context) {
        await ctx.scene.leave();

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
            "📊 <b>Hisobotlar bo'limi</b>\n\nQaysi turdagi hisobotni ko'rmoqchisiz?",
            Markup.inlineKeyboard(reportButtons, {
                columns: 2,
            }),
            'Hisobotlar',
        );
    }

    private async generatePaymentReport(ctx: Context, period: string, detailed: boolean = false) {
        await safeEditMessageText(
            ctx,
            '🔄 Hisobot tayyorlanmoqda...',
            undefined,
            'Yuklanmoqda',
        );

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

        try {
            const [paymentStats, totalRevenue, totalTransactions] = await Promise.all([
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
                this.prisma.payment.count({
                    where: {
                        order: whereClause,
                        created_at: { gte: startDate, lt: endDate },
                    },
                }),
            ]);

            const totalAmount = totalRevenue._sum.amount || 0;
            const paymentData: PaymentReportData[] = paymentStats.map((ps) => {
                const sumAmount = ps._sum.amount || 0;
                const avgAmount = ps._avg.amount || 0;
                const percentage = totalAmount > 0
                    ? parseFloat(((sumAmount / totalAmount) * 100).toFixed(1))
                    : 0;

                return {
                    paymentType: ps.payment_type,
                    count: ps._count,
                    totalAmount: sumAmount,
                    averageAmount: Math.round(avgAmount),
                    percentage,
                };
            });

            paymentData.sort((a, b) => b.totalAmount - a.totalAmount);

            const reportSummary: ReportSummary = {
                totalRevenue: totalAmount,
                totalTransactions,
                paymentData,
                periodName,
                branchInfo: user.role === Role.ADMIN ? `🏪 <b>Filial:</b> ${user.branch?.name || 'N/A'}` : undefined,
            };

            const report = detailed
                ? ReportFormatter.formatDetailedPaymentReport(reportSummary)
                : ReportFormatter.formatPaymentReport(reportSummary);

            const buttons = [
                Markup.button.callback('🔄 Yangilash', `PAYMENT_${period.toUpperCase()}`),
                Markup.button.callback('🔙 Orqaga', 'BACK_TO_REPORTS'),
            ];

            if (!detailed && paymentData.length > 0) {
                buttons.unshift(Markup.button.callback('📋 Batafsil', 'PAYMENT_DETAILED'));
            }

            await safeEditMessageText(
                ctx,
                report,
                Markup.inlineKeyboard(buttons, { columns: 2 }),
                'Hisobot',
            );

        } catch (error) {
            console.error('Payment report generation error:', error);
            await safeEditMessageText(
                ctx,
                '❌ Hisobot yaratishda xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.',
                Markup.inlineKeyboard([Markup.button.callback('🔙 Orqaga', 'BACK_TO_REPORTS')]),
                'Xatolik',
            );
        }
    }
}
