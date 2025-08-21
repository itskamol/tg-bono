export class ReportHelpers {
    static getPeriodDates(period: string) {
        const today = new Date();
        let startDate: Date;
        let endDate: Date;
        let periodName: string;

        switch (period) {
            case 'today':
                startDate = new Date(today);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(startDate);
                endDate.setDate(endDate.getDate() + 1);
                periodName = 'Bugungi';
                break;
            case 'week':
                startDate = new Date(today);
                startDate.setDate(startDate.getDate() - 7);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(today);
                endDate.setHours(23, 59, 59, 999);
                periodName = 'Haftalik';
                break;
            case 'month':
                startDate = new Date(today);
                startDate.setDate(startDate.getDate() - 30);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(today);
                endDate.setHours(23, 59, 59, 999);
                periodName = 'Oylik';
                break;
            case 'quarter':
                startDate = new Date(today);
                startDate.setDate(startDate.getDate() - 90);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(today);
                endDate.setHours(23, 59, 59, 999);
                periodName = '3 oylik';
                break;
            default:
                startDate = new Date(today);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(startDate);
                endDate.setDate(endDate.getDate() + 1);
                periodName = 'Bugungi';
        }

        return { startDate, endDate, periodName };
    }

    static getPaymentEmoji(paymentType: string): string {
        const emojis = {
            cash: '💵',
            card: '💳',
            credit: '🏦',
        };
        return emojis[paymentType.toLowerCase()] || '💰';
    }

    static getTypeEmoji(type: string): string {
        const emojis = {
            pizza: '🍕',
            burger: '🍔',
            drink: '🥤',
            dessert: '🍰',
            salad: '🥗',
        };
        return emojis[type.toLowerCase()] || '📦';
    }

    static capitalizeFirst(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}
