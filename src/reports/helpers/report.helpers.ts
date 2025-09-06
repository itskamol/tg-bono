import { PaymentType, Role } from '@prisma/client';
import { Markup } from 'telegraf';
import { InlineKeyboardMarkup } from 'telegraf/typings/core/types/typegram';
import { Period, PeriodName, ReportType } from '../types';

export class ReportHelpers {
    static getPeriodDates(period: Period) {
        const today = new Date();
        let startDate: Date;
        let endDate: Date;
        let periodName: PeriodName;

        switch (period) {
            case Period.TODAY:
                startDate = new Date(today);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(startDate);
                endDate.setDate(endDate.getDate() + 1);
                periodName = PeriodName.TODAY;
                break;
            case Period.WEEK:
                startDate = new Date(today);
                startDate.setDate(startDate.getDate() - 7);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(today);
                endDate.setHours(23, 59, 59, 999);
                periodName = PeriodName.WEEK;
                break;
            case Period.MONTH:
                startDate = new Date(today);
                startDate.setDate(startDate.getDate() - 30);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(today);
                endDate.setHours(23, 59, 59, 999);
                periodName = PeriodName.MONTH;
                break;
            case Period.QUARTER:
                startDate = new Date(today);
                startDate.setDate(startDate.getDate() - 90);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(today);
                endDate.setHours(23, 59, 59, 999);
                periodName = PeriodName.QUARTER;
                break;
            default:
                startDate = new Date(today);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(startDate);
                endDate.setDate(endDate.getDate() + 1);
                periodName = PeriodName.TODAY;
                break;
        }

        return { startDate, endDate, periodName };
    }

    static getPaymentEmoji(paymentType: PaymentType): string {
        const paymentEmojis = {
            [PaymentType.CASH]: '💵',
            [PaymentType.CARD]: '💳',
            [PaymentType.TRANSFER]: '📱',
        };
        return paymentEmojis[paymentType] || '💰';
    }

    static getPaymentName(paymentType: PaymentType): string {
        const paymentNames = {
            [PaymentType.CASH]: 'Naqd',
            [PaymentType.CARD]: 'Karta',
            [PaymentType.TRANSFER]: 'Nasiya',
        };
        return paymentNames[paymentType] || paymentType;
    }

    static getReportButtons(reportType: ReportType): Markup.Markup<InlineKeyboardMarkup> {
        const periods = Object.values(Period);

        const buttons = periods.map((period: Period) => {
            return Markup.button.callback(`${PeriodName[period]}`, `${reportType}_${period}`);
        });

        buttons.push(Markup.button.callback('🔙 Orqaga', 'BACK_TO_REPORTS'));

        return Markup.inlineKeyboard(buttons, { columns: 2 });
    }

    static getReportTypes(userRole: Role): Markup.Markup<InlineKeyboardMarkup> {
        const reportButtons = [
            Markup.button.callback('📊 Umumiy', 'GENERAL_REPORTS'),
            Markup.button.callback("🧾 To'lovlar", 'PAYMENT_REPORTS'),
        ];

        // Super admin barcha hisobotlarni ko'ra oladi
        if (userRole === Role.SUPER_ADMIN) {
            reportButtons.push(
                Markup.button.callback('🏪 Filiallar', 'BRANCH_REPORTS'),
                Markup.button.callback('👥 Xodimlar', 'USER_REPORTS'),
            );
        }

        // Admin o'z filiali bo'yicha xodimlar hisobotini ko'ra oladi
        if (userRole === Role.ADMIN) {
            reportButtons.push(
                Markup.button.callback('👥 Xodimlar', 'USER_REPORTS'),
            );
        }

        return Markup.inlineKeyboard(reportButtons, {
            columns: 2,
        });
    }
}
