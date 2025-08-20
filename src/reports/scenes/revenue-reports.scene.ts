import { Scene, SceneEnter, Action, Ctx } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';
import { Role } from '../../auth/enums/role.enum';
import { ReportHelpers } from '../helpers/report.helpers';

@Scene('revenue-reports-scene')
export class RevenueReportsScene {
  constructor(private readonly prisma: PrismaService) {}

  @SceneEnter()
  async onSceneEnter(@Ctx() ctx: Context) {
    await ctx.reply(
      '💰 Daromad hisoboti\n\nDavrni tanlang:',
      Markup.inlineKeyboard([
        Markup.button.callback('📅 Bugun', 'REVENUE_TODAY'),
        Markup.button.callback('📈 Hafta', 'REVENUE_WEEK'),
        Markup.button.callback('📅 Oy', 'REVENUE_MONTH'),
        Markup.button.callback('📊 3 oy', 'REVENUE_QUARTER'),
        Markup.button.callback('🔙 Orqaga', 'BACK_TO_REPORTS')
      ])
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
    // Get user from database since ctx.user might not be available in scenes
    const telegramId = ctx.from?.id;
    if (!telegramId) {
      await ctx.editMessageText('❌ Telegram ID topilmadi.');
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { telegram_id: telegramId },
      include: { branch: true }
    });

    if (!user) {
      await ctx.editMessageText('❌ Siz tizimda ro\'yxatdan o\'tmagansiz.');
      return;
    }

    const { startDate, endDate, periodName } = ReportHelpers.getPeriodDates(period);
    let whereClause = {};

    if (user.role === Role.ADMIN && user.branch_id) {
      whereClause = { branch_id: user.branch_id };
    }

    const revenueData = await this.prisma.$queryRaw`
      SELECT 
        DATE(created_at) as date,
        SUM(total_amount) as daily_revenue,
        COUNT(*) as daily_orders,
        AVG(total_amount) as avg_order_value
      FROM \`Order\`
      WHERE created_at >= ${startDate} AND created_at < ${endDate}
      ${user.role === Role.ADMIN && user.branch_id ? 
        `AND branch_id = '${user.branch_id}'` : ''}
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT 15
    `;

    const revenueList = (revenueData as any[]).map(day => 
      `📅 ${new Date(day.date).toLocaleDateString('uz-UZ')}:
  • Daromad: ${day.daily_revenue} so'm
  • Buyurtmalar: ${day.daily_orders} ta
  • O'rtacha: ${Math.round(day.avg_order_value)} so'm`
    ).join('\n\n');

    const totalRevenue = (revenueData as any[]).reduce((sum, day) => sum + Number(day.daily_revenue), 0);
    const totalOrders = (revenueData as any[]).reduce((sum, day) => sum + Number(day.daily_orders), 0);
    const avgDaily = Math.round(totalRevenue / (revenueData as any[]).length);

    const report = `
💰 ${periodName.toUpperCase()} DAROMAD HISOBOTI

📊 Umumiy ko'rsatkichlar:
• Jami daromad: ${totalRevenue} so'm
• Jami buyurtmalar: ${totalOrders} ta
• Kunlik o'rtacha: ${avgDaily} so'm

📅 Kunlik taqsimot:
${revenueList || 'Ma\'lumot yo\'q'}

${user.role === Role.ADMIN ? `🏪 Filial: ${user.branch?.name || 'N/A'}` : '🌐 Barcha filiallar'}
    `;

    await ctx.editMessageText(report);
  }
}