import { UseGuards } from '@nestjs/common';
import { Update, Command, Ctx, Action } from 'nestjs-telegraf';
import { AuthGuard } from '../auth/guards/auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { PrismaService } from '../prisma/prisma.service';
import { Context } from '../interfaces/context.interface';
import { Markup } from 'telegraf';
import { Prisma } from '@prisma/client';
import { EncryptionService } from '../settings/encryption.service';
import * as nodemailer from 'nodemailer';
import { ReportsService } from './reports.service';
import { GoogleSheetsService } from 'src/sheets/google-sheets.service';

@Update()
@UseGuards(AuthGuard)
export class ReportsUpdate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly reportsService: ReportsService,
    private readonly googleSheetsService: GoogleSheetsService,
  ) {}

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
    const where: Prisma.OrderWhereInput = { created_at: { gte } };

    let reportTitle = `Report for: ${timeRange}`;
    let reportText = '';

    if (user.role === Role.SUPER_ADMIN) {
      reportTitle += ' (All Branches)';
      const branches = await this.prisma.branch.findMany({
        include: { orders: { where } },
      });
      reportText = branches
        .map((branch) => this.formatReport(branch.name, branch.orders))
        .join('\n\n');
    } else if (user.role === Role.ADMIN) {
      if (!user.branch_id) return ctx.editMessageText('You are not assigned to a branch.');
      where.branch_id = user.branch_id;
      reportTitle += ` (Branch: ${user.branch.name})`;
      const cashiers = await this.prisma.user.findMany({
        where: { branch_id: user.branch_id, role: Role.KASSIR },
        include: { orders: { where } },
      });
      reportText = cashiers.map((c) => this.formatReport(c.full_name, c.orders)).join('\n\n');
    } else if (user.role === Role.KASSIR) {
      where.cashier_id = user.id;
      reportTitle += ` (My Orders)`;
      const myOrders = await this.prisma.order.findMany({ where });
      reportText = this.formatReport(user.full_name, myOrders);
    }

    await ctx.editMessageText(
      `${reportTitle}\n\n${reportText || 'No data for this period.'}`,
      Markup.inlineKeyboard([Markup.button.callback('Export', `EXPORT_OPTIONS_${timeRange}`)]),
    );
  }

  @Action(/EXPORT_OPTIONS_(.+)/)
  async onExportOptions(@Ctx() ctx: Context) {
    const timeRange = (ctx.callbackQuery as any).data.split('_')[2];
    const emailConfig = await this.prisma.setting.findUnique({ where: { key: 'email_config' } });
    const gSheetsConfig = await this.prisma.setting.findUnique({ where: { key: 'g_sheets_config' } });

    const buttons = [Markup.button.callback('Download as CSV', `EXPORT_CSV_${timeRange}`)];
    if (emailConfig) buttons.push(Markup.button.callback('Send to Email', `EXPORT_EMAIL_${timeRange}`));
    if (gSheetsConfig) buttons.push(Markup.button.callback('Send to Google Sheets', `EXPORT_G_SHEETS_${timeRange}`));

    if (buttons.length === 1) {
        await ctx.answerCbQuery();
        return this.onExportCsv(ctx); // Directly download if no other options
    }

    await ctx.editMessageText('Select an export method:', Markup.inlineKeyboard(buttons));
  }

  @Action(/EXPORT_CSV_(.+)/)
  async onExportCsv(@Ctx() ctx: Context) {
    await ctx.answerCbQuery('Generating CSV export...');
    const timeRange = (ctx.callbackQuery as any).data.split('_')[2];
    const orders = await this.reportsService.getOrdersForReport(ctx.user, timeRange);
    if (orders.length === 0) return ctx.reply('No data to export for this period.');

    const csvData = this.reportsService.convertToCsv(orders);
    const fileName = `report_${timeRange.toLowerCase()}_${new Date().toISOString().split('T')[0]}.csv`;
    await ctx.replyWithDocument({ source: Buffer.from(csvData, 'utf-8'), filename: fileName });
  }

  @Action(/EXPORT_EMAIL_(.+)/)
  async onExportEmail(@Ctx() ctx: Context) {
    await ctx.answerCbQuery('Sending email...');
    const timeRange = (ctx.callbackQuery as any).data.split('_')[2];
    const success = await this.reportsService.sendScheduledReportByEmail(ctx.user, timeRange);
    if (success) {
      await ctx.editMessageText(`Report successfully sent via email.`);
    } else {
      await ctx.editMessageText('Failed to send report via email. Check settings or logs.');
    }
  }

  @Action(/EXPORT_G_SHEETS_(.+)/)
  async onExportGoogleSheets(@Ctx() ctx: Context) {
    await ctx.answerCbQuery('Sending to Google Sheets...');
    const timeRange = (ctx.callbackQuery as any).data.split('_')[2];
    const gSheetsConfigSetting = await this.prisma.setting.findUnique({ where: { key: 'g_sheets_config' } });
    if (!gSheetsConfigSetting) return ctx.editMessageText('Google Sheets settings are not configured.');

    const configStr = this.encryptionService.decrypt(gSheetsConfigSetting.value);
    const config = JSON.parse(configStr);

    const orders = await this.reportsService.getOrdersForReport(ctx.user, timeRange);
    if (orders.length === 0) return ctx.editMessageText('No data to export for this period.');

    const worksheetName = `Report-${timeRange}-${new Date().toISOString().split('T')[0]}`;

    const preparedData = orders.map(o => ({
        'Order Number': o.order_number,
        'Date': o.created_at.toISOString(),
        'Client Name': o.client_name,
        'Client Phone': o.client_phone,
        'Branch': o.branch.name,
        'Cashier': o.cashier.full_name,
        'Payment Type': o.payment_type,
        'Total Amount': o.total_amount,
    }));

    const success = await this.googleSheetsService.appendData(
        config.sheetId,
        config.credentials,
        preparedData,
        worksheetName,
    );

    if (success) {
        await ctx.editMessageText(`Report successfully sent to Google Sheets. Worksheet: "${worksheetName}"`);
    } else {
        await ctx.editMessageText('Failed to send the report to Google Sheets. Please check the logs.');
    }
  }

  private getDateFilter(timeRange: string): Date | undefined {
    const now = new Date();
    if (timeRange === 'DAILY') return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (timeRange === 'WEEKLY') {
      const d = new Date();
      d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1));
      d.setHours(0, 0, 0, 0);
      return d;
    }
    if (timeRange === 'MONTHLY') return new Date(now.getFullYear(), now.getMonth(), 1);
    return undefined;
  }

  private formatReport(groupName: string, orders: any[]): string {
    if (orders.length === 0) return `**${groupName}**\nNo orders.`;
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
