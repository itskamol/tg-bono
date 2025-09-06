import { Action, Ctx, Scene, SceneEnter } from 'nestjs-telegraf';
import { safeEditMessageText } from 'src/utils/telegram.utils';
import { ReportHelpers } from '../helpers/report.helpers';
import { Context } from 'src/interfaces/context.interface';
import { Period, ReportType, ReportTypeName } from '../types';
import { PrismaService } from 'src/prisma/prisma.service';
import { Order_Product, Prisma, Role, User } from '@prisma/client';
import { Markup } from 'telegraf';

interface BaseReportState {
    reportType: ReportType;
}

@Scene('reports-scene')
export class BaseReports {
    private reportType: ReportType;

    constructor(protected readonly prisma: PrismaService) {}

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        const state = ctx.scene.state as BaseReportState;

        if (!state || !state.reportType) {
            await safeEditMessageText(ctx, '❌ Hisobot turi aniqlanmadi.', undefined, 'Xatolik');
            await ctx.scene.leave();
            return;
        }

        this.reportType = state.reportType;

        const reportTypeName = ReportTypeName[this.reportType];

        await safeEditMessageText(
            ctx,
            `${reportTypeName} hisoboti\n\nDavrni tanlang:`,
            ReportHelpers.getReportButtons(this.reportType),
            `${reportTypeName} hisoboti`,
        );
    }

    @Action('BACK_TO_PERIODS')
    async backToPeriods(@Ctx() ctx: Context) {
        const reportTypeName = ReportTypeName[this.reportType];

        await safeEditMessageText(
            ctx,
            `${reportTypeName} hisoboti\n\nDavrni tanlang:`,
            ReportHelpers.getReportButtons(this.reportType),
            `${reportTypeName} hisoboti`,
        );
    }

    @Action(/^[A-Z_]+_(TODAY|WEEK|MONTH|QUARTER)$/)
    async handlePeriodReport(@Ctx() ctx: Context) {
        if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

        const action = ctx.callbackQuery.data;
        if (!action) return;

        const [, periodStr] = action.split('_');
        const period = Period[periodStr as keyof typeof Period];

        if (!period) {
            await ctx.answerCbQuery("Noma'lum davr tanlandi.");
            return;
        }
        await this.generateReport(ctx, period);
    }

    protected async generateReport(ctx: Context, period: Period) {
        const user = await this.getUser(ctx);
        if (!user) return;

        const { startDate, endDate, periodName } = ReportHelpers.getPeriodDates(period);
        const whereClause = this.getWhereClause(user);

        try {
            await safeEditMessageText(
                ctx,
                '📊 Hisobot tayyorlanmoqda...',
                undefined,
                'Yuklanmoqda',
            );

            const reportData = await this.fetchReportData(whereClause, startDate, endDate);
            const report = this.formatReport(reportData, periodName, user);

            await safeEditMessageText(
                ctx,
                report,
                Markup.inlineKeyboard([Markup.button.callback('🔙 Orqaga', 'BACK_TO_PERIODS')]),
                'Hisobot',
            );
        } catch (error) {
            console.error('Report generation error:', error);
            await safeEditMessageText(
                ctx,
                "❌ Hisobot yaratishda xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.",
                Markup.inlineKeyboard([Markup.button.callback('🔙 Orqaga', 'BACK_TO_PERIODS')]),
                'Xatolik',
            );
        }
    }

    protected async getUser(ctx: Context) {
        const telegramId = ctx.from?.id;
        if (!telegramId) {
            await safeEditMessageText(ctx, '❌ Telegram ID topilmadi.', undefined, 'Xatolik');
            return null;
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
            return null;
        }

        return user;
    }

    protected getWhereClause(user: User) {
        if (user.role === Role.SUPER_ADMIN) {
            return {};
        }

        if (user.role === Role.ADMIN && user.branch_id) {
            return { branch_id: user.branch_id };
        }

        if (user.role === Role.CASHIER) {
            return { cashier_id: user.id };
        }

        return { id: 'non-existent' };
    }

    // Abstract methods - child class'larda implement qilinadi
    protected async fetchReportData(
        whereClause: any,
        startDate: Date,
        endDate: Date,
    ): Promise<any> {
        const reportType = this.reportType;

        switch (reportType) {
            case ReportType.GENERAL:
                return this.fetchGeneralReportData(whereClause, startDate, endDate);
            case ReportType.PAYMENT:
                return this.fetchPaymentReportData(whereClause, startDate, endDate);
            case ReportType.BRANCH:
                return this.fetchBranchReportData(whereClause, startDate, endDate);
            case ReportType.USER:
                return this.fetchUserReportData(whereClause, startDate, endDate);
            default:
                throw new Error(`Unknown report type: ${reportType}`);
        }
    }

    protected formatReport(data: any, periodName: string, user: any): string {
        const reportType = this.reportType;

        switch (reportType) {
            case ReportType.GENERAL:
                return this.formatGeneralReport(data, periodName, user);
            case ReportType.PAYMENT:
                return this.formatPaymentReport(data, periodName, user);
            case ReportType.BRANCH:
                return this.formatBranchReport(data, periodName, user);
            case ReportType.USER:
                return this.formatUserReport(data, periodName, user);
            default:
                return `${periodName} hisoboti`;
        }
    }

    protected async fetchGeneralReportData(whereClause: any, startDate: Date, endDate: Date) {
        const [ordersCount, totalRevenue, avgOrderValue, topProducts]: [
            number,
            any,
            any,
            Order_Product[],
        ] = await Promise.all([
            this.prisma.order.count({
                where: { ...whereClause, created_at: { gte: startDate, lt: endDate } },
            }),
            this.prisma.order.aggregate({
                where: { ...whereClause, created_at: { gte: startDate, lt: endDate } },
                _sum: { total_amount: true },
            }),
            this.prisma.order.aggregate({
                where: { ...whereClause, created_at: { gte: startDate, lt: endDate } },
                _avg: { total_amount: true },
            }),
            this.prisma.order_Product.findMany({
                where: {
                    order: { ...whereClause, created_at: { gte: startDate, lt: endDate } },
                },
                orderBy: {
                    quantity: 'desc',
                },
                take: 20,
            }),
        ]);

        const productMap = new Map();
        topProducts.forEach((item: Order_Product) => {
            const productName = item.category + ' ' + item.side_name;
            if (productMap.has(productName)) {
                const existing = productMap.get(productName);
                existing.quantity += item.quantity;
                existing.totalPrice += item.price * item.quantity;
            } else {
                productMap.set(productName, {
                    product_name: item.product_name,
                    side_name: item.side_name,
                    category: item.category,
                    quantity: item.quantity,
                    totalPrice: item.price * item.quantity,
                });
            }
        });

        const groupedProducts = Array.from(productMap.values())
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, 5);

        return {
            ordersCount,
            totalRevenue: totalRevenue._sum.total_amount || 0,
            avgOrder: Math.round(avgOrderValue._avg.total_amount || 0),
            topProducts: groupedProducts,
        };
    }

    protected formatGeneralReport(
        data: {
            ordersCount: number;
            totalRevenue: number;
            avgOrder: number;
            topProducts: Order_Product[];
        },
        periodName: string,
        user: any,
    ): string {
        const topProductsList = data.topProducts
            .map((item: any, index: number) => {
                return `${index + 1}. <b>${item.product_name}</b> [${item.side_name}] (${item.category}): ${this.formatNumber(item.quantity || 0)} ta - <b>${this.formatCurrency(item?.totalPrice || 0)}</b>`;
            })
            .join('\n');

        return `
<b>${periodName.toUpperCase()} UMUMIY HISOBOT</b>

📈 <b>Asosiy ko'rsatkichlar:</b>
• <b>Buyurtmalar soni:</b> ${this.formatNumber(data.ordersCount)} ta
• <b>Jami daromad:</b> ${this.formatCurrency(data.totalRevenue)}
• <b>O'rtacha buyurtma:</b> ${this.formatCurrency(data.avgOrder)}

🏆 <b>Eng ko'p sotilgan mahsulotlar (tomonlar):</b>
${topProductsList || "Ma'lumot yo'q"}

${user.role === Role.ADMIN || user.role === Role.CASHIER ? `🏪 <b>Filial:</b> ${user.branch?.name || 'N/A'}` : '🌐 <b>Barcha filiallar</b>'}

📅 <b>Davr:</b> ${new Date().toLocaleDateString('uz-UZ')}
        `.trim();
    }

    protected async fetchPaymentReportData(whereClause: any, startDate: Date, endDate: Date) {
        const payments = await this.prisma.payment.findMany({
            where: {
                order: { ...whereClause, created_at: { gte: startDate, lt: endDate } },
            },
            include: {
                order: true,
            },
        });

        const paymentStats = payments.reduce((acc: any, payment) => {
            const type = payment.payment_type;
            if (!acc[type]) {
                acc[type] = {
                    payment_type: type,
                    _count: 0,
                    _sum: { amount: 0 },
                };
            }
            acc[type]._count++;
            acc[type]._sum.amount += payment.amount;
            return acc;
        }, {});

        const totalOrders = await this.prisma.order.count({
            where: { ...whereClause, created_at: { gte: startDate, lt: endDate } },
        });

        const totalRevenue = await this.prisma.order.aggregate({
            where: { ...whereClause, created_at: { gte: startDate, lt: endDate } },
            _sum: { total_amount: true },
        });

        return {
            paymentStats: Object.values(paymentStats),
            totalOrders,
            totalRevenue: totalRevenue._sum.total_amount || 0,
        };
    }

    protected formatPaymentReport(data: any, periodName: string, user: any): string {
        const paymentBreakdown = data.paymentStats
            .map((payment: any) => {
                const percentage =
                    data.totalOrders > 0
                        ? ((payment._count / data.totalOrders) * 100).toFixed(1)
                        : '0';
                return `${ReportHelpers.getPaymentEmoji(payment.payment_type)} <b>${ReportHelpers.getPaymentName(payment.payment_type)}:</b>
  • To'lovlar: ${this.formatNumber(payment._count)} ta (${percentage}%)
  • Summa: ${this.formatCurrency(payment._sum.amount || 0)}`;
            })
            .join('\n\n');

        return `
<b>${periodName.toUpperCase()} TO'LOV HISOBOTI</b>

📊 <b>Umumiy ma'lumotlar:</b>
• <b>Jami buyurtmalar:</b> ${this.formatNumber(data.totalOrders)} ta
• <b>Jami daromad:</b> ${this.formatCurrency(data.totalRevenue)}

💰 <b>To'lov turlari bo'yicha:</b>
${paymentBreakdown || "Ma'lumot yo'q"}

${user.role === Role.ADMIN || user.role === Role.CASHIER ? `🏪 <b>Filial:</b> ${user.branch?.name || 'N/A'}` : '🌐 <b>Barcha filiallar</b>'}

📅 <b>Davr:</b> ${new Date().toLocaleDateString('uz-UZ')}
        `.trim();
    }

    protected async fetchBranchReportData(whereClause: any, startDate: Date, endDate: Date) {
        if (whereClause.branch_id) {
            const branchStats = await this.prisma.order.aggregate({
                where: { ...whereClause, created_at: { gte: startDate, lt: endDate } },
                _count: true,
                _sum: { total_amount: true },
                _avg: { total_amount: true },
            });

            const branch = await this.prisma.branch.findUnique({
                where: { id: whereClause.branch_id },
            });

            return {
                branches: [
                    {
                        branch,
                        stats: branchStats,
                    },
                ],
            };
        } else {
            const branches = await this.prisma.branch.findMany();
            const branchStats = await Promise.all(
                branches.map(async (branch) => {
                    const stats = await this.prisma.order.aggregate({
                        where: {
                            branch_id: branch.id,
                            created_at: { gte: startDate, lt: endDate },
                        },
                        _count: true,
                        _sum: { total_amount: true },
                        _avg: { total_amount: true },
                    });
                    return { branch, stats };
                }),
            );

            return { branches: branchStats };
        }
    }

    protected formatBranchReport(data: any, periodName: string, user: any): string {
        const branchList = data.branches
            .map((item: any, index: number) => {
                const stats = item.stats;
                return `${index + 1}. <b>${item.branch.name}</b>
  📍 ${item.branch.address}
  📊 Buyurtmalar: ${this.formatNumber(stats._count || 0)} ta
  💰 Daromad: ${this.formatCurrency(stats._sum.total_amount || 0)}
  📈 O'rtacha: ${this.formatCurrency(Math.round(stats._avg.total_amount || 0))}`;
            })
            .join('\n\n');

        const totalRevenue = data.branches.reduce(
            (sum: number, item: any) => sum + (item.stats._sum.total_amount || 0),
            0,
        );
        const totalOrders = data.branches.reduce(
            (sum: number, item: any) => sum + (item.stats._count || 0),
            0,
        );

        return `
<b>${periodName.toUpperCase()} FILIALLAR HISOBOTI</b>

📊 <b>Umumiy ko'rsatkichlar:</b>
• <b>Jami buyurtmalar:</b> ${this.formatNumber(totalOrders)} ta
• <b>Jami daromad:</b> ${this.formatCurrency(totalRevenue)}
• <b>Faol filiallar:</b> ${data.branches.length} ta

🏢 <b>Filiallar bo'yicha tafsilot:</b>
${branchList || "Ma'lumot yo'q"}

📅 <b>Davr:</b> ${new Date().toLocaleDateString('uz-UZ')}
        `.trim();
    }

    protected async fetchUserReportData(whereClause: any, startDate: Date, endDate: Date) {
        const userStats = await this.prisma.order.groupBy({
            by: ['cashier_id'],
            where: { ...whereClause, created_at: { gte: startDate, lt: endDate } },
            _count: true,
            _sum: { total_amount: true },
            _avg: { total_amount: true },
            orderBy: { _sum: { total_amount: 'desc' } },
            take: 10,
        });

        const usersWithNames = await Promise.all(
            userStats.map(async (item) => {
                const user = await this.prisma.user.findUnique({
                    where: { id: item.cashier_id },
                    include: { branch: true },
                });
                return {
                    ...item,
                    user,
                };
            }),
        );

        return { userStats: usersWithNames };
    }

    protected formatUserReport(data: any, periodName: string, user: any): string {
        const userList = data.userStats
            .map((item: any, index: number) => {
                return `${index + 1}. <b>${item.user?.full_name || "Noma'lum"}</b>
  🏪 ${item.user?.branch?.name || 'N/A'}
  📊 Buyurtmalar: ${this.formatNumber(item._count)} ta
  💰 Daromad: ${this.formatCurrency(item._sum.total_amount || 0)}
  📈 O'rtacha: ${this.formatCurrency(Math.round(item._avg.total_amount || 0))}`;
            })
            .join('\n\n');

        const totalOrders = data.userStats.reduce((sum: number, item: any) => sum + item._count, 0);
        const totalRevenue = data.userStats.reduce(
            (sum: number, item: any) => sum + (item._sum.total_amount || 0),
            0,
        );

        return `
<b>${periodName.toUpperCase()} XODIMLAR HISOBOTI</b>

📊 <b>Umumiy ko'rsatkichlar:</b>
• <b>Jami buyurtmalar:</b> ${this.formatNumber(totalOrders)} ta
• <b>Jami daromad:</b> ${this.formatCurrency(totalRevenue)}
• <b>Faol xodimlar:</b> ${data.userStats.length} ta

👨‍💼 <b>Eng yaxshi xodimlar:</b>
${userList || "Ma'lumot yo'q"}

${user.role === Role.ADMIN || user.role === Role.CASHIER ? `🏪 <b>Filial:</b> ${user.branch?.name || 'N/A'}` : '🌐 <b>Barcha filiallar</b>'}

📅 <b>Davr:</b> ${new Date().toLocaleDateString('uz-UZ')}
        `.trim();
    }

    protected formatCurrency(amount: number): string {
        return new Intl.NumberFormat('uz-UZ', {
            style: 'currency',
            currency: 'UZS',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        })
            .format(amount)
            .replace('UZS', "so'm");
    }

    protected formatNumber(num: number): string {
        return new Intl.NumberFormat('uz-UZ').format(num);
    }
}
