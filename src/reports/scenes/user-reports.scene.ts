import { Scene, SceneEnter, Action, Ctx } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';
import { ReportHelpers } from '../helpers/report.helpers';
import { Role } from '@prisma/client';

@Scene('user-reports-scene')
export class UserReportsScene {
    constructor(private readonly prisma: PrismaService) {}

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        await ctx.reply(
            '👥 Foydalanuvchilar hisoboti\n\nDavrni tanlang:',
            Markup.inlineKeyboard([
                Markup.button.callback('📅 Bugun', 'USER_TODAY'),
                Markup.button.callback('📈 Hafta', 'USER_WEEK'),
                Markup.button.callback('📅 Oy', 'USER_MONTH'),
                Markup.button.callback('📊 3 oy', 'USER_QUARTER'),
                Markup.button.callback('🔙 Orqaga', 'BACK_TO_REPORTS'),
            ]),
        );
    }

    @Action('USER_TODAY')
    async generateTodayReport(@Ctx() ctx: Context) {
        await this.generateUserReport(ctx, 'today');
        await ctx.scene.leave();
    }

    @Action('USER_WEEK')
    async generateWeekReport(@Ctx() ctx: Context) {
        await this.generateUserReport(ctx, 'week');
        await ctx.scene.leave();
    }

    @Action('USER_MONTH')
    async generateMonthReport(@Ctx() ctx: Context) {
        await this.generateUserReport(ctx, 'month');
        await ctx.scene.leave();
    }

    @Action('USER_QUARTER')
    async generateQuarterReport(@Ctx() ctx: Context) {
        await this.generateUserReport(ctx, 'quarter');
        await ctx.scene.leave();
    }

    @Action('BACK_TO_REPORTS')
    async backToReports(@Ctx() ctx: Context) {
        await ctx.scene.leave();
    }

    private async generateUserReport(ctx: Context, period: string) {
        // Get user from database to verify permissions
        const telegramId = ctx.from?.id;
        if (!telegramId) {
            await ctx.editMessageText('❌ Telegram ID topilmadi.');
            return;
        }

        const user = await this.prisma.user.findUnique({
            where: { telegram_id: telegramId },
        });

        if (!user || user.role !== Role.SUPER_ADMIN) {
            await ctx.editMessageText("❌ Sizda bu hisobotni ko'rish huquqi yo'q.");
            return;
        }

        const { startDate, endDate, periodName } = ReportHelpers.getPeriodDates(period);

        const [userStats, activeUsers] = await Promise.all([
            this.prisma.user.groupBy({
                by: ['role'],
                _count: true,
            }),
            this.prisma.user.findMany({
                where: {
                    orders: {
                        some: {
                            created_at: { gte: startDate, lt: endDate },
                        },
                    },
                },
                include: {
                    branch: true,
                    _count: {
                        select: {
                            orders: {
                                where: {
                                    created_at: { gte: startDate, lt: endDate },
                                },
                            },
                        },
                    },
                    orders: {
                        where: { created_at: { gte: startDate, lt: endDate } },
                        select: { total_amount: true },
                    },
                },
                orderBy: {
                    orders: {
                        _count: 'desc',
                    },
                },
                take: 10,
            }),
        ]);

        const rolesList = userStats
            .map((rs) => `• ${ReportHelpers.capitalizeFirst(rs.role)}: ${rs._count} ta`)
            .join('\n');

        const activeUsersList = activeUsers
            .map((user, index) => {
                const revenue = user.orders.reduce((sum, order) => sum + order.total_amount, 0);
                return `${index + 1}. ${user.full_name} (${user.branch?.name || 'N/A'}):
  • Buyurtmalar: ${user._count.orders} ta
  • Daromad: ${revenue} so'm`;
            })
            .join('\n\n');

        const report = `
👥 ${periodName.toUpperCase()} FOYDALANUVCHILAR HISOBOTI

📊 Rollar bo'yicha:
${rolesList}

🔥 Eng faol kassirlar:
${activeUsersList || "Ma'lumot yo'q"}
    `;

        await ctx.editMessageText(report);
    }
}
