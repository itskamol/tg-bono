import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../settings/encryption.service';
import { GoogleSheetsService } from '../sheets/google-sheets.service';
import { EmailService } from '../email/email.service';
import { Prisma, Role } from '@prisma/client';
import { formatCurrency, formatNumber } from '../utils/format.utils';

@Injectable()
export class ReportsService {
    private readonly logger = new Logger(ReportsService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly encryptionService: EncryptionService,
        private readonly googleSheetsService: GoogleSheetsService,
        private readonly emailService: EmailService,
    ) {}

    async sendReportByEmail(
        user: any,
        timeRange: string,
        detailed: boolean = false,
    ): Promise<boolean> {
        this.logger.log(
            `Attempting to send report via email for user ${user.id} and range ${timeRange}`,
        );

        const emailConfigSetting = await this.prisma.setting.findUnique({
            where: { key: 'email_config' },
        });

        if (!emailConfigSetting) {
            this.logger.warn('Email settings not configured. Cannot send email.');
            return false;
        }

        const configStr = this.encryptionService.decrypt(emailConfigSetting.value);
        const config = JSON.parse(configStr);

        const orders = await this.getOrdersForReportWithDetails(user, timeRange);

        if (orders.length === 0) {
            this.logger.log('No data for the report. Skipping email.');
            return true; // Not an error, just no data to send
        }

        try {
            const timeRangeNames = {
                DAILY: 'Kunlik',
                WEEKLY: 'Haftalik',
                MONTHLY: 'Oylik',
            };

            const subject = `${timeRangeNames[timeRange] || timeRange} Buyurtmalar Hisoboti - ${new Date().toLocaleDateString('uz-UZ')}`;

            const success = await this.emailService.sendOrdersReport(
                config,
                orders,
                subject,
                detailed,
            );

            if (success) {
                this.logger.log(`Report sent to ${config.recipient}`);
                return true;
            } else {
                this.logger.error('Failed to send email report');
                return false;
            }
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
        } else if (user.role === Role.CASHIER) {
            where.cashier_id = user.id;
        }

        return this.prisma.order.findMany({
            where,
            include: { branch: true, cashier: true },
            orderBy: { created_at: 'desc' },
        });
    }

    public convertToCsv(orders: any[]): string {
        const header =
            'Order Number,Date,Client Name,Client Phone,Branch,Cashier,Payment Types,Total Amount\n';
        const rows = orders
            .map((o) => {
                const clientName = o.client_name.includes(',')
                    ? `"${o.client_name}"`
                    : o.client_name;

                // Format payment types from payments array
                const paymentTypes =
                    o.payments && o.payments.length > 0
                        ? o.payments.map((p) => `${p.payment_type}:${p.amount}`).join(';')
                        : 'N/A';

                return `${o.order_number},${o.created_at.toISOString()},${clientName},"${o.client_phone}",${o.branch.name},${o.cashier.full_name},"${paymentTypes}",${o.total_amount}`;
            })
            .join('\n');
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

    // Google Sheets'ga report yuborish
    async sendReportToGoogleSheets(
        user: any,
        timeRange: string,
        detailed: boolean = false,
    ): Promise<boolean> {
        this.logger.log(
            `Attempting to send report to Google Sheets for user ${user.id} and range ${timeRange}`,
        );

        const gSheetsConfigSetting = await this.prisma.setting.findUnique({
            where: { key: 'g_sheets_config' },
        });

        if (!gSheetsConfigSetting) {
            this.logger.warn('Google Sheets settings not configured. Cannot export to sheets.');
            return false;
        }

        try {
            const configStr = this.encryptionService.decrypt(gSheetsConfigSetting.value);
            const config = JSON.parse(configStr);

            this.logger.log(`Google Sheets config loaded. Sheet ID: ${config.sheetId}`);

            const orders = await this.getOrdersForReportWithDetails(user, timeRange);
            this.logger.log(`Found ${orders.length} orders for export`);

            if (orders.length === 0) {
                this.logger.log('No data for the report. Skipping Google Sheets export.');
                return true; // Not an error, just no data to send
            }

            const worksheetName = `${timeRange}_${new Date().toISOString().split('T')[0]}`;
            this.logger.log(`Attempting to write to worksheet: ${worksheetName}`);

            const result = await this.googleSheetsService.appendOrdersToSheet(
                config.sheetId,
                config.credentials,
                orders,
                worksheetName,
                detailed,
            );

            if (result.success) {
                this.logger.log(
                    `Report successfully exported to Google Sheets worksheet: ${worksheetName}`,
                );
                return true;
            } else {
                this.logger.error(`Failed to export report to Google Sheets: ${result.error}`);
                return false;
            }
        } catch (error) {
            this.logger.error('Google Sheets export failed with error:', error);
            this.logger.error('Error stack:', error.stack);
            return false;
        }
    }

    // To'liq ma'lumotlar bilan orderlarni olish
    public async getOrdersForReportWithDetails(user: any, timeRange: string): Promise<any[]> {
        const gte = this._getDateFilter(timeRange);
        const where: Prisma.OrderWhereInput = { created_at: { gte } };

        if (user.role === Role.ADMIN) {
            if (!user.branch_id) return [];
            where.branch_id = user.branch_id;
        } else if (user.role === Role.CASHIER) {
            where.cashier_id = user.id;
        }

        return this.prisma.order.findMany({
            where,
            include: {
                branch: true,
                cashier: true,
                order_products: true,
                payments: true,
            },
            orderBy: { created_at: 'desc' },
        });
    }

    // Barcha export turlarini birdan bajarish
    async sendReportToAllConfiguredDestinations(
        user: any,
        timeRange: string,
    ): Promise<{ email: boolean; sheets: boolean }> {
        const results = {
            email: false,
            sheets: false,
        };

        // Email export (detailed format)
        try {
            results.email = await this.sendReportByEmail(user, timeRange, true);
        } catch (error) {
            this.logger.error('Email export failed:', error);
        }

        // Google Sheets export (detailed format)
        try {
            results.sheets = await this.sendReportToGoogleSheets(user, timeRange, true);
        } catch (error) {
            this.logger.error('Google Sheets export failed:', error);
        }

        return results;
    }
}
