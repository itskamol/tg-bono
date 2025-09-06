import { PaymentType } from '@prisma/client';
import { formatCurrency } from '../../utils/format.utils';

export interface PaymentReportData {
    paymentType: string;
    count: number;
    totalAmount: number;
    averageAmount: number;
    percentage: number;
}

export interface ReportSummary {
    totalRevenue: number;
    totalTransactions: number;
    paymentData: PaymentReportData[];
    periodName: string;
    branchInfo?: string;
}

export class ReportFormatter {
    /**
     * Format payment types report with improved visual structure
     */
    static formatPaymentReport(summary: ReportSummary): string {
        const { totalRevenue, totalTransactions, paymentData, periodName, branchInfo } = summary;

        // Header with decorative elements
        const header = this.createHeader(periodName);

        // Summary section
        const summarySection = this.createSummarySection(totalRevenue, totalTransactions);

        // Payment details section
        const paymentSection = this.createPaymentSection(paymentData);

        // Footer with branch info
        const footer = this.createFooter(branchInfo);

        return [header, summarySection, paymentSection, footer].join('\n\n');
    }

    /**
     * Create formatted header
     */
    private static createHeader(periodName: string): string {
        const title = `${periodName.toUpperCase()} TO'LOV TURLARI HISOBOTI`;
        const separator = '═'.repeat(Math.min(title.length, 35));

        return `💳 ${title}`;
    }

    /**
     * Create summary section with key metrics
     */
    private static createSummarySection(totalRevenue: number, totalTransactions: number): string {
        return `📈 UMUMIY MA'LUMOTLAR:
 💰 Jami daromad: ${formatCurrency(totalRevenue)} 
 🔢 Jami to'lovlar: ${totalTransactions.toString()} ta 
`;
    }

    /**
     * Create detailed payment section
     */
    private static createPaymentSection(paymentData: PaymentReportData[]): string {
        if (!paymentData || paymentData.length === 0) {
            return `📋 TO'LOV TURLARI:
        Ma'lumot mavjud emas     
`;
        }

        const paymentLines = paymentData
            .map((payment, index) => {
                const emoji = this.getPaymentEmoji(payment.paymentType);
                const typeName = this.getPaymentTypeName(payment.paymentType);

                return this.formatPaymentItem(payment, emoji, typeName);
            })
            .join('\n');

        return `📋 TO'LOV TURLARI:
${paymentLines}`;
    }

    /**
     * Format individual payment item
     */
    private static formatPaymentItem(
        payment: PaymentReportData,
        emoji: string,
        typeName: string,
    ): string {

        return `
${emoji} ${typeName.toUpperCase()}:
🔹 To'lovlar: ${payment.count} ta
🔹 Daromad: ${formatCurrency(payment.totalAmount)} (${payment.percentage}%)
🔹 O'rtacha: ${formatCurrency(payment.averageAmount)}`;
    }

    /**
     * Create footer with branch information
     */
    private static createFooter(branchInfo?: string): string {
        const location = branchInfo || '🌐 Barcha filiallar';
        const timestamp = new Date().toLocaleString('uz-UZ', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });

        return `
 📍 ${location}       
 🕐 ${timestamp}      
`;
    }

    /**
     * Get emoji for payment type
     */
    private static getPaymentEmoji(paymentType: string): string {
        const paymentEmojis = {
            [PaymentType.CASH]: '💵',
            [PaymentType.CARD]: '💳',
            [PaymentType.TRANSFER]: '📱',
        };
        return paymentEmojis[paymentType] || '💰';
    }

    /**
     * Get localized payment type name
     */
    private static getPaymentTypeName(paymentType: string): string {
        const paymentNames = {
            [PaymentType.CASH]: 'Naqd',
            [PaymentType.CARD]: 'Karta',
            [PaymentType.TRANSFER]: "O'tkazma",
        };
        return paymentNames[paymentType] || paymentType;
    }

    /**
     * Format compact payment report for quick view
     */
    static formatCompactPaymentReport(summary: ReportSummary): string {
        const { totalRevenue, paymentData, periodName, branchInfo } = summary;

        const paymentLines = paymentData
            .map((payment) => {
                const emoji = this.getPaymentEmoji(payment.paymentType);
                const typeName = this.getPaymentTypeName(payment.paymentType);
                return `${emoji} ${typeName}: ${payment.count}ta • ${formatCurrency(payment.totalAmount)} (${payment.percentage}%)`;
            })
            .join('\n');

        return `💳 ${periodName.toUpperCase()} HISOBOT
📊 Jami: ${formatCurrency(totalRevenue)}

${paymentLines || "Ma'lumot yo'q"}

${branchInfo || '🌐 Barcha filiallar'}`;
    }

    /**
     * Format detailed payment report with additional metrics
     */
    static formatDetailedPaymentReport(summary: ReportSummary): string {
        const basicReport = this.formatPaymentReport(summary);

        if (!summary.paymentData || summary.paymentData.length === 0) {
            return basicReport;
        }

        // Add additional analytics
        const analytics = this.createAnalyticsSection(summary);

        return `${basicReport}\n\n${analytics}`;
    }

    /**
     * Create analytics section with insights
     */
    private static createAnalyticsSection(summary: ReportSummary): string {
        const { paymentData, totalRevenue } = summary;

        // Find most popular payment method
        const mostPopular = paymentData.reduce((prev, current) =>
            prev.count > current.count ? prev : current,
        );

        // Find highest revenue payment method
        const highestRevenue = paymentData.reduce((prev, current) =>
            prev.totalAmount > current.totalAmount ? prev : current,
        );

        const mostPopularEmoji = this.getPaymentEmoji(mostPopular.paymentType);
        const highestRevenueEmoji = this.getPaymentEmoji(highestRevenue.paymentType);

        return `📊 TAHLIL:
 🏆 Eng ko'p: ${mostPopularEmoji} ${this.getPaymentTypeName(mostPopular.paymentType)} 
 💎 Eng daromadli: ${highestRevenueEmoji} ${this.getPaymentTypeName(highestRevenue.paymentType)} 
 📈 O'rtacha to'lov: ${formatCurrency(Math.round(totalRevenue / paymentData.reduce((sum, p) => sum + p.count, 0)))} 
`;
    }
}
