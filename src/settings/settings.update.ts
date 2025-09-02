import { Update, Command, Ctx, Action } from 'nestjs-telegraf';
import { Roles } from '../auth/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { Context } from '../interfaces/context.interface';
import { Markup } from 'telegraf';
import { Role } from '@prisma/client';
import { safeEditMessageText } from '../utils/telegram.utils';

@Update()
export class SettingsUpdate {
    constructor(private readonly prisma: PrismaService) {}

    @Command('settings')
    @Roles(Role.SUPER_ADMIN)
    async onSettings(@Ctx() ctx: Context) {
        await safeEditMessageText(
            ctx,
            '⚙️ Sozlamalar:',
            Markup.inlineKeyboard(
                [
                    Markup.button.callback('📧 Email', 'configure_email_export'),
                    Markup.button.callback('📊 Sheets', 'configure_g_sheets_export'),
                    Markup.button.callback('⏰ Rejalashtirish', 'configure_schedule'),
                ],
                {
                    columns: 2,
                },
            ),
            'Sozlamalar'
        );
    }

    @Action('configure_email_export')
    async onConfigureEmailExport(@Ctx() ctx: Context) {
        await ctx.scene.enter('email-settings-scene');
    }

    @Action('configure_g_sheets_export')
    async onConfigureGoogleSheetsExport(@Ctx() ctx: Context) {
        await ctx.scene.enter('g-sheets-settings-scene');
    }

    @Action('configure_schedule')
    async onConfigureSchedule(@Ctx() ctx: Context) {
        await ctx.scene.enter('schedule-settings-scene');
    }
}