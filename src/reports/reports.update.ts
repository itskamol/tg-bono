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

        await safeEditMessageText(
            ctx,
            "📊 Hisobotlar bo'limi\n\nQaysi turdagi hisobotni ko'rmoqchisiz?",
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

    @Command('test_email')
    @Roles(Role.SUPER_ADMIN)
    async testEmail(@Ctx() ctx: Context) {
        await safeEditMessageText(ctx, '🔄 Email ulanishini tekshiryapman...', undefined, 'Test');

        try {
            const user = ctx.user;
            const result = await this.reportsService.sendReportByEmail(user, 'DAILY', true);

            if (result) {
                await safeEditMessageText(
                    ctx,
                    '✅ Email test muvaffaqiyatli! Kunlik hisobot yuborildi.',
                    undefined,
                    'Test natijasi',
                );
            } else {
                await safeEditMessageText(
                    ctx,
                    '❌ Email test muvaffaqiyatsiz. Loglarni tekshiring.',
                    undefined,
                    'Test natijasi',
                );
            }
        } catch (error) {
            await safeEditMessageText(
                ctx,
                `❌ Email test xatolik: ${error.message}`,
                undefined,
                'Test xatolik',
            );
        }
    }
}
