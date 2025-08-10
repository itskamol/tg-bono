import { UseGuards } from '@nestjs/common';
import { Update, Command, Ctx, Action } from 'nestjs-telegraf';
import { AuthGuard } from '../auth/guards/auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { PrismaService } from '../prisma/prisma.service';
import { Context } from '../interfaces/context.interface';
import { Markup } from 'telegraf';
import { Prisma } from '@prisma/client';

@Update()
@UseGuards(AuthGuard)
export class ReportsUpdate {
  constructor(private readonly prisma: PrismaService) {}

  @Command('report')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.KASSIR)
  async onReport(@Ctx() ctx: Context) {
    await ctx.reply(
      'Please select a time range for the report:',
      Markup.inlineKeyboard([
        Markup.button.callback('Daily', 'REPORT_DAILY'),
        Markup.button.callback('Weekly', 'REPORT_WEEKLY'),
        Markup.button.callback('Monthly', 'REPORT_MONTHLY'),
        Markup.button.callback('All Time', 'REPORT_ALL'),
      ]),
    );
  }

  @Action(/REPORT_(.+)/)
  async onReportTimeRange(@Ctx() ctx: Context) {
    const timeRange = (ctx.callbackQuery as any).data.split('_')[1];
    const user = ctx.user;

    const gte = this.getDateFilter(timeRange);
    const where: Prisma.OrderWhereInput = {
      created_at: { gte },
    };

    let reportTitle = `Report for: ${timeRange}`;
    let reportText = '';

    // Role-based data scoping
    if (user.role === Role.SUPER_ADMIN) {
      reportTitle += ' (All Branches)';
      const branches = await this.prisma.branch.findMany({
        include: {
          orders: { where },
        },
      });
      reportText = branches.map(branch => this.formatReport(branch.name, branch.orders)).join('\n\n');
    } else if (user.role === Role.ADMIN) {
      if (!user.branch_id) {
        return ctx.editMessageText('You are not assigned to a branch.');
      }
      where.branch_id = user.branch_id;
      reportTitle += ` (Branch: ${user.branch.name})`;
      const cashiers = await this.prisma.user.findMany({
          where: {branch_id: user.branch_id, role: Role.KASSIR},
          include: { orders: { where } }
      })
      reportText = cashiers.map(c => this.formatReport(c.full_name, c.orders)).join('\n\n');

    } else if (user.role === Role.KASSIR) {
      where.cashier_id = user.id;
      reportTitle += ` (My Orders)`;
      const myOrders = await this.prisma.order.findMany({ where });
      reportText = this.formatReport(user.full_name, myOrders);
    }

    await ctx.editMessageText(`${reportTitle}\n\n${reportText || 'No data for this period.'}`);
  }

  private getDateFilter(timeRange: string): Date | undefined {
    const now = new Date();
    if (timeRange === 'DAILY') {
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }
    if (timeRange === 'WEEKLY') {
      const firstDayOfWeek = now.getDate() - now.getDay();
      return new Date(now.setDate(firstDayOfWeek));
    }
    if (timeRange === 'MONTHLY') {
      return new Date(now.getFullYear(), now.getMonth(), 1);
    }
    return undefined; // ALL
  }

  private formatReport(groupName: string, orders: any[]): string {
    if (orders.length === 0) {
      return `**${groupName}**\nNo orders.`;
    }

    const totalOrders = orders.length;
    const totalAmount = orders.reduce((sum, o) => sum + o.total_amount, 0);
    const byPaymentType = orders.reduce((acc, o) => {
      acc[o.payment_type] = (acc[o.payment_type] || 0) + o.total_amount;
      return acc;
    }, {});

    return `
**${groupName}**
- Total Orders: ${totalOrders}
- Total Revenue: ${totalAmount.toFixed(2)}
- Breakdown:
  - Cash: ${byPaymentType.cash?.toFixed(2) || 0}
  - Card: ${byPaymentType.card?.toFixed(2) || 0}
  - Credit: ${byPaymentType.credit?.toFixed(2) || 0}
    `.trim();
  }
}
