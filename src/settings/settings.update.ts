import { Update, Command, Ctx, Action } from 'nestjs-telegraf';
import { Roles } from '../auth/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { Context } from '../interfaces/context.interface';
import { Markup } from 'telegraf';
import { Role } from '@prisma/client';

@Update()
export class SettingsUpdate {
    constructor(private readonly prisma: PrismaService) {}

    @Command('settings')
    @Roles(Role.SUPER_ADMIN)
    async onSettings(@Ctx() ctx: Context) {
        await ctx.reply(
            'Sozlamalar:',
            Markup.inlineKeyboard(
                [
                    Markup.button.callback('Email', 'configure_email_export'),
                    Markup.button.callback('Sheets', 'configure_g_sheets_export'),
                    Markup.button.callback('Hisobotlarni rejalashtirish', 'configure_schedule'),
                ],
                {
                    columns: 2,
                },
            ),
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