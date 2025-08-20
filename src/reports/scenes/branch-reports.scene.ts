import { Scene, SceneEnter, Action, Ctx } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';
import { ReportHelpers } from '../helpers/report.helpers';

@Scene('branch-reports-scene')
export class BranchReportsScene {
  constructor(private readonly prisma: PrismaService) {}

  @SceneEnter()
  async onSceneEnter(@Ctx() ctx: Context) {
    await ctx.reply(
      '🏪 Filiallar hisoboti\n\nDavrni tanlang:',
      Markup.inlineKeyboard([
        Markup.button.callback('📅 Bugun', 'BRANCH_TODAY'),
        Markup.button.callback('📈 Hafta', 'BRANCH_WEEK'),
        Markup.button.callback('📅 Oy', 'BRANCH_MONTH'),
        Markup.button.callback('📊 3 oy', 'BRANCH_QUARTER'),
        Markup.button.callback('🔙 Orqaga', 'BACK_TO_REPORTS')
      ])
    );
  }

  @Action('BRANCH_TODAY')
  async generateTodayReport(@Ctx() ctx: Context) {
    await this.generateBranchReport(ctx, 'today');
    await ctx.scene.leave();
  }

  @Action('BRANCH_WEEK')
  async generateWeekReport(@Ctx() ctx: Context) {
    await this.generateBranchReport(ctx, 'week');
    await ctx.scene.leave();
  }

  @Action('BRANCH_MONTH')
  async generateMonthReport(@Ctx() ctx: Context) {
    await this.generateBranchReport(ctx, 'month');
    await ctx.scene.leave();
  }

  @Action('BRANCH_QUARTER')
  async generateQuarterReport(@Ctx() ctx: Context) {
    await this.generateBranchReport(ctx, 'quarter');
    await ctx.scene.leave();
  }

  @Action('BACK_TO_REPORTS')
  async backToReports(@Ctx() ctx: Context) {
    await ctx.scene.leave();
  }

  private async generateBranchReport(ctx: Context, period: string) {
    // Get user from database to verify permissions
    const telegramId = ctx.from?.id;
    if (!telegramId) {
      await ctx.editMessageText('❌ Telegram ID topilmadi.');
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { telegram_id: telegramId }
    });

    if (!user || user.role !== 'super_admin') {
      await ctx.editMessageText('❌ Sizda bu hisobotni ko\'rish huquqi yo\'q.');
      return;
    }

    const { startDate, endDate, periodName } = ReportHelpers.getPeriodDates(period);

    const branchStats = await this.prisma.branch.findMany({
      include: {
        _count: {
          select: { 
            users: true,
            orders: {
              where: { created_at: { gte: startDate, lt: endDate } }
            }
          }
        },
        orders: {
          where: { created_at: { gte: startDate, lt: endDate } },
          select: { total_amount: true }
        }
      }
    });

    const branchList = branchStats.map(branch => {
      const revenue = branch.orders.reduce((sum, order) => sum + order.total_amount, 0);
      const avgOrder = branch._count.orders > 0 ? Math.round(revenue / branch._count.orders) : 0;
      return `🏪 ${branch.name}:
  • Foydalanuvchilar: ${branch._count.users} ta
  • Buyurtmalar: ${branch._count.orders} ta
  • Daromad: ${revenue} so'm
  • O'rtacha buyurtma: ${avgOrder} so'm`;
    }).join('\n\n');

    const totalRevenue = branchStats.reduce((sum, branch) => 
      sum + branch.orders.reduce((orderSum, order) => orderSum + order.total_amount, 0), 0);
    const totalOrders = branchStats.reduce((sum, branch) => sum + branch._count.orders, 0);

    const report = `
🏪 ${periodName.toUpperCase()} FILIALLAR HISOBOTI

📊 Umumiy ko'rsatkichlar:
• Jami daromad: ${totalRevenue} so'm
• Jami buyurtmalar: ${totalOrders} ta

${branchList || 'Ma\'lumot yo\'q'}
    `;

    await ctx.editMessageText(report);
  }
}