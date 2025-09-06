import { Scene, SceneEnter, Action, Ctx } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';
import { ReportHelpers } from '../helpers/report.helpers';
import { Role } from '@prisma/client';
import { formatCurrency, formatNumber } from '../../utils/format.utils';
import { safeEditMessageText } from '../../utils/telegram.utils';

@Scene('general-reports-scene')
export class GeneralReportsScene {
    constructor(private readonly prisma: PrismaService) { }

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        await safeEditMessageText(
            ctx,
            '📊 <b>Umumiy hisobotlar</b>\n\nDavrni tanlang:',
            Markup.inlineKeyboard(
                [
                    Markup.button.callback('📅 Bugun', 'GENERAL_TODAY'),
                    Markup.button.callback('📈 Hafta', 'GENERAL_WEEK'),
                    Markup.button.callback('📅 Oy', 'GENERAL_MONTH'),
                    Markup.button.callback('📊 3 oy', 'GENERAL_QUARTER'),
                    Markup.button.callback('🔙 Orqaga', 'BACK_TO_REPORTS'),
                ],
                {
                    columns: 2,
                },
            ),
            'Umumiy hisobotlar',
        );
    }

    @Action('GENERAL_TODAY')
    async generateTodayReport(@Ctx() ctx: Context) {
        await this.generateGeneralReport(ctx, 'today');
    }

    @Action('GENERAL_WEEK')
    async generateWeekReport(@Ctx() ctx: Context) {
        await this.generateGeneralReport(ctx, 'week');
    }

    @Action('GENERAL_MONTH')
    async generateMonthReport(@Ctx() ctx: Context) {
        await this.generateGeneralReport(ctx, 'month');
    }

    @Action('GENERAL_QUARTER')
    async generateQuarterReport(@Ctx() ctx: Context) {
        await this.generateGeneralReport(ctx, 'quarter');
    }

    @Action('BACK_TO_REPORTS')
    async backToReports(@Ctx() ctx: Context) {
        await ctx.scene.leave();

        const user = ctx.user;
        const reportButtons = [
            Markup.button.callback('📊 Umumiy', 'GENERAL_REPORTS'),
            Markup.button.callback("$ To'lovlar", 'PAYMENT_REPORTS'),
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

    private async generateGeneralReport(ctx: Context, period: string) {
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

        const [ordersCount, totalRevenue, avgOrderValue, topCategories] = await Promise.all([
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
                by: ['category'],
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
                orderBy: { _sum: { price: 'desc' } },
                take: 5,
            }),
        ]);

        const topCategoriesList = topCategories
            .map((tc) => {
                const totalAmount = (tc._sum.price || 0) * (tc._sum.quantity || 0);
                return `• <b>${tc.category}</b>: ${formatNumber(tc._sum.quantity || 0)} ta - <b>${formatCurrency(totalAmount)}</b>`;
            })
            .join('\n');

        const report = `
📊 <b>${periodName.toUpperCase()} UMUMIY HISOBOT</b>

📈 <b>Asosiy ko'rsatkichlar:</b>
• <b>Buyurtmalar soni:</b> ${formatNumber(ordersCount)} ta
• <b>Jami daromad:</b> ${formatCurrency(totalRevenue._sum.total_amount || 0)}
• <b>O'rtacha buyurtma:</b> ${formatCurrency(Math.round(avgOrderValue._avg.total_amount || 0))}

📦 <b>Eng ko'p sotilgan kategoriyalar:</b>
${topCategoriesList || "Ma'lumot yo'q"}

${user.role === Role.ADMIN ? `🏪 <b>Filial:</b> ${user.branch?.name || 'N/A'}` : '🌐 <b>Barcha filiallar</b>'}
    `;

        await safeEditMessageText(
            ctx,
            report,
            Markup.inlineKeyboard([Markup.button.callback('🔙 Orqaga', 'BACK_TO_REPORTS')]),
            'Hisobot',
        );
    }
}
