import { Update, Ctx, Action } from 'nestjs-telegraf';
import { Context } from '../interfaces/context.interface';
import { Role } from '@prisma/client';
import { safeEditMessageText } from '../utils/telegram.utils';
import { ReportHelpers } from './helpers/report.helpers';
import { ReportType } from './types';

@Update()
export class ReportsUpdate {
    constructor() {}

    async showReports(@Ctx() ctx: Context) {
        const user = ctx.user;

        const reportButtons = ReportHelpers.getReportTypes(user.role);

        const branchInfo =
            user.role === Role.ADMIN || user.role === Role.CASHIER
                ? `\n🏪 <b>Filial:</b> ${user.branch?.name || 'N/A'}`
                : '\n🌐 <b>Barcha filiallar</b>';

        await safeEditMessageText(
            ctx,
            `📊 <b>Hisobotlar bo'limi</b>${branchInfo}\n\nQaysi turdagi hisobotni ko'rmoqchisiz?`,
            reportButtons,
            'Hisobotlar',
        );
    }

    @Action('BACK_TO_REPORTS')
    async backToReports(@Ctx() ctx: Context) {
        await ctx.scene.leave();

        const user = ctx.user;
        const reportButtons = ReportHelpers.getReportTypes(user.role);

        await safeEditMessageText(
            ctx,
            "📊 Hisobotlar bo'limi\n\nQaysi turdagi hisobotni ko'rmoqchisiz?",
            reportButtons,
            'Hisobotlar',
        );
    }

    @Action(/^[A-Z_]+_REPORTS$/)
    async showReport(@Ctx() ctx: Context) {
        if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

        const action = ctx.callbackQuery.data;
        if (!action) return;

        const [reportType] = action.split('_REPORTS');

        if (!Object.values(ReportType).includes(reportType as ReportType)) {
            await ctx.answerCbQuery("Noma'lum hisobot turi tanlandi.");
            return;
        }

        await ctx.scene.enter('reports-scene', { reportType });
    }
}
