import { Update, Command, Ctx, Action } from 'nestjs-telegraf';
import { Roles } from '../auth/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from './encryption.service';
import { Context } from '../interfaces/context.interface';
import { Markup } from 'telegraf';
import { Role } from '@prisma/client';
import { safeEditMessageText } from '../utils/telegram.utils';

@Update()
export class SettingsUpdate {
    constructor(
        private readonly prisma: PrismaService,
        private readonly encryptionService: EncryptionService,
    ) { }

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
            ),
            'Sozlamalar',
        );
    }

    @Action('configure_email_export')
    async onConfigureEmailExport(@Ctx() ctx: Context) {
        // Mavjud email sozlamalarini tekshirish
        const emailConfig = await this.prisma.setting.findUnique({
            where: { key: 'email_config' }
        });

        if (emailConfig) {
            // Agar sozlamalar mavjud bo'lsa, CRUD menyusini ko'rsatish
            await safeEditMessageText(
                ctx,
                '📧 Email sozlamalari:\n\n✅ Email sozlamalari mavjud',
                Markup.inlineKeyboard([
                    [Markup.button.callback('👁️ Ko\'rish', 'view_email_config')],
                    [Markup.button.callback('✏️ Tahrirlash', 'edit_email_config')],
                    [Markup.button.callback('🗑️ O\'chirish', 'delete_email_config')],
                    [Markup.button.callback('⬅️ Orqaga', 'back_to_settings')]
                ]),
                'Email CRUD menyu'
            );
        } else {
            // Agar sozlamalar yo'q bo'lsa, yangi yaratish
            await ctx.scene.enter('email-settings-scene');
        }
    }

    @Action('configure_g_sheets_export')
    async onConfigureGoogleSheetsExport(@Ctx() ctx: Context) {
        // Mavjud Google Sheets sozlamalarini tekshirish
        const gSheetsConfig = await this.prisma.setting.findUnique({
            where: { key: 'g_sheets_config' }
        });

        if (gSheetsConfig) {
            // Agar sozlamalar mavjud bo'lsa, CRUD menyusini ko'rsatish
            await safeEditMessageText(
                ctx,
                '📊 Google Sheets sozlamalari:\n\n✅ Google Sheets sozlamalari mavjud',
                Markup.inlineKeyboard([
                    [Markup.button.callback('👁️ Ko\'rish', 'view_sheets_config')],
                    [Markup.button.callback('✏️ Tahrirlash', 'edit_sheets_config')],
                    [Markup.button.callback('🗑️ O\'chirish', 'delete_sheets_config')],
                    [Markup.button.callback('⬅️ Orqaga', 'back_to_settings')]
                ]),
                'Sheets CRUD menyu'
            );
        } else {
            // Agar sozlamalar yo'q bo'lsa, yangi yaratish
            await ctx.scene.enter('g-sheets-settings-scene');
        }
    }

    @Action('configure_schedule')
    async onConfigureSchedule(@Ctx() ctx: Context) {
        await ctx.scene.enter('schedule-settings-scene');
    }

    @Action('view_email_config')
    async onViewEmailConfig(@Ctx() ctx: Context) {
        try {
            const emailConfig = await this.prisma.setting.findUnique({
                where: { key: 'email_config' }
            });

            if (!emailConfig) {
                await safeEditMessageText(
                    ctx,
                    '❌ Email sozlamalari topilmadi',
                    Markup.inlineKeyboard([
                        [Markup.button.callback('⬅️ Orqaga', 'configure_email_export')]
                    ]),
                    'Email topilmadi'
                );
                return;
            }

            try {
                // Email sozlamalarini decrypt qilish
                const decryptedConfig = this.encryptionService.decrypt(emailConfig.value);
                const config = JSON.parse(decryptedConfig);

                const configText = `📧 Email sozlamalari:\n\n` +
                    `📨 Jo'natuvchi: ${config.auth?.user || 'Noma\'lum'}\n` +
                    `📧 Qabul qiluvchilar: ${config.recipient || 'Noma\'lum'}\n` +
                    `🔗 SMTP Server: ${config.host || 'Noma\'lum'}:${config.port || 'Noma\'lum'}\n` +
                    `🔐 Xavfsizlik: ${config.secure ? 'SSL/TLS' : 'STARTTLS'}`;

                await safeEditMessageText(
                    ctx,
                    configText,
                    Markup.inlineKeyboard([
                        [Markup.button.callback('✏️ Tahrirlash', 'edit_email_config')],
                        [Markup.button.callback('🗑️ O\'chirish', 'delete_email_config')],
                        [Markup.button.callback('⬅️ Orqaga', 'configure_email_export')]
                    ]),
                    'Email ma\'lumotlari'
                );
            } catch (decryptError) {
                await safeEditMessageText(
                    ctx,
                    '📧 Email sozlamalari:\n\n✅ Sozlamalar mavjud va faol\n❌ Ma\'lumotlarni o\'qishda xatolik',
                    Markup.inlineKeyboard([
                        [Markup.button.callback('✏️ Tahrirlash', 'edit_email_config')],
                        [Markup.button.callback('🗑️ O\'chirish', 'delete_email_config')],
                        [Markup.button.callback('⬅️ Orqaga', 'configure_email_export')]
                    ]),
                    'Email ma\'lumotlari'
                );
            }
        } catch (error) {
            await safeEditMessageText(
                ctx,
                '❌ Email sozlamalarini ko\'rishda xatolik yuz berdi',
                Markup.inlineKeyboard([
                    [Markup.button.callback('⬅️ Orqaga', 'configure_email_export')]
                ]),
                'Xatolik'
            );
        }
    }

    @Action('edit_email_config')
    async onEditEmailConfig(@Ctx() ctx: Context) {
        await ctx.scene.enter('email-settings-scene');
    }

    @Action('delete_email_config')
    async onDeleteEmailConfig(@Ctx() ctx: Context) {
        await safeEditMessageText(
            ctx,
            '🗑️ Email sozlamalarini o\'chirish\n\n⚠️ Diqqat! Bu amal qaytarib bo\'lmaydi.\n\nEmail sozlamalarini o\'chirishni tasdiqlaysizmi?',
            Markup.inlineKeyboard([
                [Markup.button.callback('✅ Ha, o\'chirish', 'confirm_delete_email')],
                [Markup.button.callback('❌ Yo\'q, bekor qilish', 'configure_email_export')]
            ]),
            'Email o\'chirish tasdiqi'
        );
    }

    @Action('confirm_delete_email')
    async onConfirmDeleteEmail(@Ctx() ctx: Context) {
        try {
            await this.prisma.setting.delete({
                where: { key: 'email_config' }
            });

            await safeEditMessageText(
                ctx,
                '✅ Email sozlamalari muvaffaqiyatli o\'chirildi',
                Markup.inlineKeyboard([
                    [Markup.button.callback('➕ Yangi sozlash', 'edit_email_config')],
                    [Markup.button.callback('⬅️ Orqaga', 'back_to_settings')]
                ]),
                'Email o\'chirildi'
            );
        } catch (error) {
            await safeEditMessageText(
                ctx,
                '❌ Email sozlamalarini o\'chirishda xatolik yuz berdi',
                Markup.inlineKeyboard([
                    [Markup.button.callback('🔄 Qayta urinish', 'confirm_delete_email')],
                    [Markup.button.callback('⬅️ Orqaga', 'configure_email_export')]
                ]),
                'O\'chirish xatosi'
            );
        }
    }

    @Action('view_sheets_config')
    async onViewSheetsConfig(@Ctx() ctx: Context) {
        try {
            const gSheetsConfig = await this.prisma.setting.findUnique({
                where: { key: 'g_sheets_config' }
            });

            if (!gSheetsConfig) {
                await safeEditMessageText(
                    ctx,
                    '❌ Google Sheets sozlamalari topilmadi',
                    Markup.inlineKeyboard([
                        [Markup.button.callback('⬅️ Orqaga', 'configure_g_sheets_export')]
                    ]),
                    'Sheets topilmadi'
                );
                return;
            }

            try {
                // Google Sheets sozlamalarini decrypt qilish
                const decryptedConfig = this.encryptionService.decrypt(gSheetsConfig.value);
                const config = JSON.parse(decryptedConfig);
                const credentials = JSON.parse(config.credentials);

                const configText = `📊 Google Sheets sozlamalari:\n\n` +
                    `📋 Sheet ID: ${config.sheetId || 'Noma\'lum'}\n` +
                    `🔑 Service Account: ${credentials.client_email || 'Noma\'lum'}\n` +
                    `📁 Project ID: ${credentials.project_id || 'Noma\'lum'}\n` +
                    `🔐 Key Type: ${credentials.type || 'Noma\'lum'}`;

                await safeEditMessageText(
                    ctx,
                    configText,
                    Markup.inlineKeyboard([
                        [Markup.button.callback('✏️ Tahrirlash', 'edit_sheets_config')],
                        [Markup.button.callback('🗑️ O\'chirish', 'delete_sheets_config')],
                        [Markup.button.callback('⬅️ Orqaga', 'configure_g_sheets_export')]
                    ]),
                    'Sheets ma\'lumotlari'
                );
            } catch (decryptError) {
                await safeEditMessageText(
                    ctx,
                    '📊 Google Sheets sozlamalari:\n\n✅ Sozlamalar mavjud va faol\n❌ Ma\'lumotlarni o\'qishda xatolik',
                    Markup.inlineKeyboard([
                        [Markup.button.callback('✏️ Tahrirlash', 'edit_sheets_config')],
                        [Markup.button.callback('🗑️ O\'chirish', 'delete_sheets_config')],
                        [Markup.button.callback('⬅️ Orqaga', 'configure_g_sheets_export')]
                    ]),
                    'Sheets ma\'lumotlari'
                );
            }
        } catch (error) {
            await safeEditMessageText(
                ctx,
                '❌ Google Sheets sozlamalarini ko\'rishda xatolik yuz berdi',
                Markup.inlineKeyboard([
                    [Markup.button.callback('⬅️ Orqaga', 'configure_g_sheets_export')]
                ]),
                'Xatolik'
            );
        }
    }

    @Action('edit_sheets_config')
    async onEditSheetsConfig(@Ctx() ctx: Context) {
        await ctx.scene.enter('g-sheets-settings-scene');
    }

    @Action('delete_sheets_config')
    async onDeleteSheetsConfig(@Ctx() ctx: Context) {
        await safeEditMessageText(
            ctx,
            '🗑️ Google Sheets sozlamalarini o\'chirish\n\n⚠️ Diqqat! Bu amal qaytarib bo\'lmaydi.\n\nGoogle Sheets sozlamalarini o\'chirishni tasdiqlaysizmi?',
            Markup.inlineKeyboard([
                [Markup.button.callback('✅ Ha, o\'chirish', 'confirm_delete_sheets')],
                [Markup.button.callback('❌ Yo\'q, bekor qilish', 'configure_g_sheets_export')]
            ]),
            'Sheets o\'chirish tasdiqi'
        );
    }

    @Action('confirm_delete_sheets')
    async onConfirmDeleteSheets(@Ctx() ctx: Context) {
        try {
            await this.prisma.setting.delete({
                where: { key: 'g_sheets_config' }
            });

            await safeEditMessageText(
                ctx,
                '✅ Google Sheets sozlamalari muvaffaqiyatli o\'chirildi',
                Markup.inlineKeyboard([
                    [Markup.button.callback('➕ Yangi sozlash', 'edit_sheets_config')],
                    [Markup.button.callback('⬅️ Orqaga', 'back_to_settings')]
                ]),
                'Sheets o\'chirildi'
            );
        } catch (error) {
            await safeEditMessageText(
                ctx,
                '❌ Google Sheets sozlamalarini o\'chirishda xatolik yuz berdi',
                Markup.inlineKeyboard([
                    [Markup.button.callback('🔄 Qayta urinish', 'confirm_delete_sheets')],
                    [Markup.button.callback('⬅️ Orqaga', 'configure_g_sheets_export')]
                ]),
                'O\'chirish xatosi'
            );
        }
    }

    @Action('back_to_settings')
    async onBackToSettings(@Ctx() ctx: Context) {
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
}
