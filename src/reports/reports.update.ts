import { Update, Command, Ctx, Action } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { Roles } from '../auth/decorators/roles.decorator';
import { Context } from '../interfaces/context.interface';
import { Role } from '@prisma/client';
import { ReportsService } from './reports.service';
import { safeEditMessageText } from '../utils/telegram.utils';

@Update()
export class ReportsUpdate {
    constructor(private readonly reportsService: ReportsService) {}
    @Command('reports')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN)
    async showReports(@Ctx() ctx: Context) {
        const user = ctx.user;

        const reportButtons = [
            Markup.button.callback('📊 Umumiy', 'GENERAL_REPORTS'),
            Markup.button.callback("💳 To'lovlar", 'PAYMENT_REPORTS'),
        ];

        if (user.role === Role.SUPER_ADMIN) {
            reportButtons.push(
                Markup.button.callback('🏪 Filiallar', 'BRANCH_REPORTS'),
                Markup.button.callback('👥 Xodimlar', 'USER_REPORTS'),
            );
        }

        const branchInfo = user.role === Role.ADMIN ? `\n🏪 Filial: ${user.branch?.name || 'N/A'}` : '\n🌐 Barcha filiallar';

        await safeEditMessageText(
            ctx,
            `📊 Hisobotlar bo'limi${branchInfo}\n\nQaysi turdagi hisobotni ko'rmoqchisiz?`,
            Markup.inlineKeyboard(reportButtons, {
                columns: 2,
            }),
            'Hisobotlar',
        );
    }

    @Action('GENERAL_REPORTS')
    async showGeneralReports(@Ctx() ctx: Context) {
        await ctx.scene.enter('general-reports-scene');
    }

    @Action('PAYMENT_REPORTS')
    async showPaymentReports(@Ctx() ctx: Context) {
        await ctx.scene.enter('payment-reports-scene');
    }

    @Action('BRANCH_REPORTS')
    @Roles(Role.SUPER_ADMIN)
    async showBranchReports(@Ctx() ctx: Context) {
        await ctx.scene.enter('branch-reports-scene');
    }

    @Action('USER_REPORTS')
    @Roles(Role.SUPER_ADMIN)
    async showUserReports(@Ctx() ctx: Context) {
        await ctx.scene.enter('user-reports-scene');
    }

    @Action('BACK_TO_REPORTS')
    async backToReports(@Ctx() ctx: Context) {
        return this.showReports(ctx);
    }

    @Command('test_sheets')
    @Roles(Role.SUPER_ADMIN)
    async testGoogleSheets(@Ctx() ctx: Context) {
        await safeEditMessageText(
            ctx,
            '🔄 Google Sheets ulanishini tekshiryapman...',
            undefined,
            'Test',
        );

        try {
            const user = ctx.user;
            const result = await this.reportsService.sendReportToGoogleSheets(user, 'DAILY', true);

            if (result) {
                await safeEditMessageText(
                    ctx,
                    '✅ Google Sheets test muvaffaqiyatli! Kunlik hisobot yuborildi.',
                    undefined,
                    'Test natijasi',
                );
            } else {
                await safeEditMessageText(
                    ctx,
                    '❌ Google Sheets test muvaffaqiyatsiz. Loglarni tekshiring.',
                    undefined,
                    'Test natijasi',
                );
            }
        } catch (error) {
            await safeEditMessageText(
                ctx,
                `❌ Google Sheets test xatolik: ${error.message}`,
                undefined,
                'Test xatolik',
            );
        }
    }

    @Command('test_format')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN)
    async testNewFormat(@Ctx() ctx: Context) {
        await safeEditMessageText(
            ctx,
            '🔄 Yangi format test qilinmoqda...',
            undefined,
            'Test',
        );

        try {
            const user = ctx.user;
            const report = await this.reportsService.getFormattedPaymentReport(user.telegram_id, 'today', true);

            await safeEditMessageText(
                ctx,
                report,
                Markup.inlineKeyboard([
                    Markup.button.callback('📊 Haftalik', 'TEST_WEEKLY'),
                    Markup.button.callback('📈 Oylik', 'TEST_MONTHLY'),
                    Markup.button.callback('🔄 Keng qamrov', 'TEST_COMPREHENSIVE'),
                ], { columns: 1 }),
                'Yangi format test',
            );
        } catch (error) {
            await safeEditMessageText(
                ctx,
                `❌ Format test xatolik: ${error.message}`,
                undefined,
                'Test xatolik',
            );
        }
    }

    @Action('TEST_WEEKLY')
    async testWeeklyFormat(@Ctx() ctx: Context) {
        const user = ctx.user;
        const report = await this.reportsService.getFormattedPaymentReport(user.telegram_id, 'week', true);
        await safeEditMessageText(ctx, report, undefined, 'Haftalik test');
    }

    @Action('TEST_MONTHLY')
    async testMonthlyFormat(@Ctx() ctx: Context) {
        const user = ctx.user;
        const report = await this.reportsService.getFormattedPaymentReport(user.telegram_id, 'month', true);
        await safeEditMessageText(ctx, report, undefined, 'Oylik test');
    }

    @Action('TEST_COMPREHENSIVE')
    async testComprehensiveFormat(@Ctx() ctx: Context) {
        const user = ctx.user;
        const report = await this.reportsService.getComprehensiveReport(user.telegram_id);
        await safeEditMessageText(ctx, report, undefined, 'Keng qamrov test');
    }
}
