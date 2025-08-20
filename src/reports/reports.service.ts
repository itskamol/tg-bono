import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../settings/encryption.service';
import { Role } from '../auth/enums/role.enum';
import { Prisma } from '@prisma/client';
import * as nodemailer from 'nodemailer';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
  ) {}

  async sendReportByEmail(user: any, timeRange: string): Promise<boolean> {
    this.logger.log(`Attempting to send report via email for user ${user.id} and range ${timeRange}`);

    const emailConfigSetting = await this.prisma.setting.findUnique({
      where: { key: 'email_config' },
    });

    if (!emailConfigSetting) {
      this.logger.warn('Email settings not configured. Cannot send email.');
      return false;
    }

    const configStr = this.encryptionService.decrypt(emailConfigSetting.value);
    const config = JSON.parse(configStr);

    const orders = await this.getOrdersForReport(user, timeRange);

    if (orders.length === 0) {
      this.logger.log('No data for the report. Skipping email.');
      return true; // Not an error, just no data to send
    }

    const csvData = this.convertToCsv(orders);
    const fileName = `report_${timeRange.toLowerCase()}_${new Date().toISOString().split('T')[0]}.csv`;

    try {
      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: config.auth,
      });

      await transporter.sendMail({
        from: `Bot <${config.auth.user}>`,
        to: config.recipient,
        subject: `Report: ${timeRange}`,
        text: `Here is your ${timeRange} report, attached as a CSV file.`,
        attachments: [{ filename: fileName, content: csvData, contentType: 'text/csv' }],
      });
      this.logger.log(`Report sent to ${config.recipient}`);
      return true;
    } catch (error) {
      this.logger.error('Email sending failed:', error);
      return false;
    }
  }

  public async getOrdersForReport(user: any, timeRange: string): Promise<any[]> {
    const gte = this._getDateFilter(timeRange);
    const where: Prisma.OrderWhereInput = { created_at: { gte } };

    if (user.role === Role.ADMIN) {
      if (!user.branch_id) return [];
      where.branch_id = user.branch_id;
    } else if (user.role === Role.KASSIR) {
      where.cashier_id = user.id;
    }

    return this.prisma.order.findMany({
      where,
      include: { branch: true, cashier: true },
      orderBy: { created_at: 'desc' },
    });
  }

  public convertToCsv(orders: any[]): string {
    const header = 'Order Number,Date,Client Name,Client Phone,Branch,Cashier,Payment Type,Total Amount\n';
    const rows = orders.map(o => {
      const clientName = o.client_name.includes(',') ? `"${o.client_name}"` : o.client_name;
      return `${o.order_number},${o.created_at.toISOString()},${clientName},"${o.client_phone}",${o.branch.name},${o.cashier.full_name},${o.payment_type},${o.total_amount}`;
    }).join('\n');
    return header + rows;
  }

  private _getDateFilter(timeRange: string): Date | undefined {
    const now = new Date();
    if (timeRange === 'DAILY') {
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }
    if (timeRange === 'WEEKLY') {
      const weeklyDate = new Date();
      const day = weeklyDate.getDay();
      const diff = weeklyDate.getDate() - day + (day === 0 ? -6 : 1);
      weeklyDate.setDate(diff);
      weeklyDate.setHours(0, 0, 0, 0);
      return weeklyDate;
    }
    if (timeRange === 'MONTHLY') {
      return new Date(now.getFullYear(), now.getMonth(), 1);
    }
    return undefined;
  }
}
