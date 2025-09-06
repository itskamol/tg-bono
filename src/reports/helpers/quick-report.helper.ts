import { PrismaService } from '../../prisma/prisma.service';
import { ReportFormatter, ReportSummary, PaymentReportData } from './report-formatter.helper';
import { ReportHelpers } from './report.helpers';
import { Role } from '@prisma/client';

export class QuickReportHelper {
    constructor(private readonly prisma: PrismaService) { }

    /**
     * Generate a quick payment summary for any period
     */
    async generateQuickPaymentSummary(
        userId: number,
        period: string = 'today',
        compact: boolean = true
    ): Promise<string> {
        const user = await this.prisma.user.findUnique({
            where: { telegram_id: userId },
            include: { branch: true },
        });

        if (!user) {
            return '❌ Foydalanuvchi topilmadi';
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
                branchInfo: user.role === Role.ADMIN ? `🏪 Filial: ${user.branch?.name || 'N/A'}` : undefined,
            };

            return compact
                ? ReportFormatter.formatCompactPaymentReport(reportSummary)
                : ReportFormatter.formatPaymentReport(reportSummary);

        } catch (error) {
            console.error('Quick report generation error:', error);
            return '❌ Hisobot yaratishda xatolik yuz berdi';
        }
    }

    /**
     * Generate daily summary for dashboard
     */
    async generateDailySummary(userId: number): Promise<string> {
        return this.generateQuickPaymentSummary(userId, 'today', true);
    }

    /**
     * Generate weekly summary
     */
    async generateWeeklySummary(userId: number): Promise<string> {
        return this.generateQuickPaymentSummary(userId, 'week', true);
    }

    /**
     * Generate monthly summary
     */
    async generateMonthlySummary(userId: number): Promise<string> {
        return this.generateQuickPaymentSummary(userId, 'month', false);
    }

    /**
     * Get payment type distribution as simple text
     */
    async getPaymentDistribution(userId: number, period: string = 'today'): Promise<string> {
        const user = await this.prisma.user.findUnique({
            where: { telegram_id: userId },
            include: { branch: true },
        });

        if (!user) return 'Foydalanuvchi topilmadi';

        const { startDate, endDate } = ReportHelpers.getPeriodDates(period);
        let whereClause = {};

        if (user.role === Role.ADMIN && user.branch_id) {
            whereClause = { branch_id: user.branch_id };
        }

        const paymentStats = await this.prisma.payment.groupBy({
            by: ['payment_type'],
            where: {
                order: whereClause,
                created_at: { gte: startDate, lt: endDate },
            },
            _count: true,
            _sum: { amount: true },
        });

        if (paymentStats.length === 0) {
            return "Ma'lumot yo'q";
        }

        const total = paymentStats.reduce((sum, p) => sum + (p._sum.amount || 0), 0);

        return paymentStats
            .map(p => {
                const percentage = total > 0 ? ((p._sum.amount || 0) / total * 100).toFixed(1) : '0';
                const emoji = ReportHelpers.getPaymentEmoji(p.payment_type);
                return `${emoji} ${percentage}%`;
            })
            .join(' • ');
    }
}