import { UseGuards } from '@nestjs/common';
import { Update, Command, Ctx, Action } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { AuthGuard } from '../auth/guards/auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Context } from '../interfaces/context.interface';
import { Role } from '@prisma/client';

@Update()
@UseGuards(AuthGuard)
export class ReportsUpdate {
    @Command('reports')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN)
    async showReports(@Ctx() ctx: Context) {
        const user = ctx.user;

        const reportButtons = [
            Markup.button.callback('📊 Umumiy', 'GENERAL_REPORTS'),
            Markup.button.callback("💳 To'lovlar", 'PAYMENT_REPORTS'),
            Markup.button.callback('📦 Mahsulotlar', 'PRODUCT_REPORTS'),
            Markup.button.callback('💰 Daromad', 'REVENUE_REPORTS'),
        ];

        if (user.role === Role.SUPER_ADMIN) {
            reportButtons.push(
                Markup.button.callback('🏪 Filiallar', 'BRANCH_REPORTS'),
                Markup.button.callback('👥 Xodimlar', 'USER_REPORTS'),
            );
        }

        await ctx.reply(
            "📊 Hisobotlar bo'limi\n\nQaysi turdagi hisobotni ko'rmoqchisiz?",
            Markup.inlineKeyboard(reportButtons, {
                columns: 2, // Har bir qatordagi tugmalar soni. 2 yoki 3 qilib o'zgartirishingiz mumkin.
            }),
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

    @Action('PRODUCT_REPORTS')
    async showProductReports(@Ctx() ctx: Context) {
        await ctx.scene.enter('product-reports-scene');
    }

    @Action('REVENUE_REPORTS')
    async showRevenueReports(@Ctx() ctx: Context) {
        await ctx.scene.enter('revenue-reports-scene');
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
}
