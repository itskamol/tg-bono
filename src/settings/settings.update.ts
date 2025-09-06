import { Update, Command, Ctx, Action } from 'nestjs-telegraf';
import { Roles } from '../auth/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from './encryption.service';
import { NotificationService } from '../notifications/notification.service';
import { Context } from '../interfaces/context.interface';
import { Markup } from 'telegraf';
import { Role } from '@prisma/client';
import { safeEditMessageText } from '../utils/telegram.utils';

@Update()
export class SettingsUpdate {
    constructor(
        private readonly prisma: PrismaService,
        private readonly encryptionService: EncryptionService,
        private readonly notificationService: NotificationService,
    ) { }

    @Command('settings')
    @Roles(Role.SUPER_ADMIN)
    async onSettings(@Ctx() ctx: Context) {
        await safeEditMessageText(
            ctx,
            '⚙️ <b>Sozlamalar:</b>',
            Markup.inlineKeyboard(
                [
                    Markup.button.callback('📊 Sheets', 'configure_g_sheets_export'),
                    Markup.button.callback('📢 Kanal/Guruh', 'configure_channel'),
                ],
                {
                    columns: 2,
                },
            ),
            'Sozlamalar',
        );
    }

    @Action('configure_g_sheets_export')
    async onConfigureGoogleSheetsExport(@Ctx() ctx: Context) {
        const gSheetsConfig = await this.prisma.setting.findUnique({
            where: { key: 'g_sheets_config' },
        });

        if (gSheetsConfig) {
            await safeEditMessageText(
                ctx,
                '📊 <b>Google Sheets sozlamalari:</b>\n\n✅ Google Sheets sozlamalari mavjud\n\n💡 Yangi orderlar avtomatik ravishda Sheets\'ga yoziladi',
                Markup.inlineKeyboard(
                    [
                        Markup.button.callback("👁️ Ko'rish", 'view_sheets_config'),
                        Markup.button.callback('✏️ Tahrirlash', 'edit_sheets_config'),
                        Markup.button.callback("🗑️ O'chirish", 'delete_sheets_config'),
                        Markup.button.callback('⬅️ Orqaga', 'back_to_settings'),
                    ],
                    {
                        columns: 2
                    }
                ),
                'Sheets CRUD menyu',
            );
        } else {
            await ctx.scene.enter('g-sheets-settings-scene');
        }
    }

    @Action('configure_channel')
    async onConfigureChannel(@Ctx() ctx: Context) {
        const channelConfig = await this.prisma.setting.findUnique({
            where: { key: 'channel_config' },
        });

        if (channelConfig) {
            await safeEditMessageText(
                ctx,
                '📢 <b>Kanal/Guruh sozlamalari:</b>\n\n✅ Kanal/Guruh sozlamalari mavjud',
                Markup.inlineKeyboard([
                    Markup.button.callback("👁️ Ko'rish", 'view_channel_config'),
                    Markup.button.callback('✏️ Tahrirlash', 'edit_channel_config'),
                    Markup.button.callback("🗑️ O'chirish", 'delete_channel_config'),
                    Markup.button.callback('⬅️ Orqaga', 'back_to_settings'),
                ], { columns: 2 }),
                'Kanal CRUD menyu',
            );
        } else {
            await ctx.scene.enter('channel-settings-scene');
        }
    }


    @Action('view_sheets_config')
    async onViewSheetsConfig(@Ctx() ctx: Context) {
        try {
            const gSheetsConfig = await this.prisma.setting.findUnique({
                where: { key: 'g_sheets_config' },
            });

            if (!gSheetsConfig) {
                await safeEditMessageText(
                    ctx,
                    '❌ Google Sheets sozlamalari topilmadi',
                    Markup.inlineKeyboard([
                        [Markup.button.callback('⬅️ Orqaga', 'configure_g_sheets_export')],
                    ]),
                    'Sheets topilmadi',
                );
                return;
            }

            try {
                const decryptedConfig = this.encryptionService.decrypt(gSheetsConfig.value);
                const config = JSON.parse(decryptedConfig);
                const credentials = JSON.parse(config.credentials);

                const autoWriteStatus = config.autoWrite !== false;
                const autoWriteEmoji = autoWriteStatus ? '✅' : '❌';
                const autoWriteText = autoWriteStatus ? 'Yoqilgan' : 'O\'chirilgan';

                const configText =
                    `📊 <b>Google Sheets sozlamalari:</b>\n\n` +
                    `📋 <b>Sheet ID:</b> <code>${config.sheetId || "Noma'lum"}</code>\n` +
                    `🔑 <b>Service Account:</b> ${credentials.client_email || "Noma'lum"}\n` +
                    `📁 <b>Project ID:</b> ${credentials.project_id || "Noma'lum"}\n` +
                    `🔐 <b>Key Type:</b> ${credentials.type || "Noma'lum"}\n` +
                    `🔄 <b>Avtomatik yozish:</b> ${autoWriteEmoji} ${autoWriteText}\n` +
                    `📅 <b>Yaratilgan:</b> ${config.createdAt ? new Date(config.createdAt).toLocaleDateString('uz-UZ') : "Noma'lum"}\n` +
                    `✏️ <b>O'zgartirilgan:</b> ${config.lastModified ? new Date(config.lastModified).toLocaleDateString('uz-UZ') : "Hech qachon"}`;

                await safeEditMessageText(
                    ctx,
                    configText,
                    Markup.inlineKeyboard([
                        Markup.button.callback('✏️ Tahrirlash', 'edit_sheets_config'),
                        Markup.button.callback("🗑️ O'chirish", 'delete_sheets_config'),
                        Markup.button.callback('⬅️ Orqaga', 'configure_g_sheets_export'),
                    ], { columns: 2 }),
                    "Sheets ma'lumotlari",
                );
            } catch (decryptError) {
                await safeEditMessageText(
                    ctx,
                    "📊 <b>Google Sheets sozlamalari:</b>\n\n✅ Sozlamalar mavjud va faol\n❌ Ma'lumotlarni o'qishda xatolik",
                    Markup.inlineKeyboard([
                        Markup.button.callback('✏️ Tahrirlash', 'edit_sheets_config'),
                        Markup.button.callback("🗑️ O'chirish", 'delete_sheets_config'),
                        Markup.button.callback('⬅️ Orqaga', 'configure_g_sheets_export'),
                    ], { columns: 2 }),
                    "Sheets ma'lumotlari",
                );
            }
        } catch (error) {
            await safeEditMessageText(
                ctx,
                "❌ Google Sheets sozlamalarini ko'rishda xatolik yuz berdi",
                Markup.inlineKeyboard([
                    Markup.button.callback('⬅️ Orqaga', 'configure_g_sheets_export'),
                ]),
                'Xatolik',
            );
        }
    }

    @Action('edit_sheets_config')
    async onEditSheetsConfig(@Ctx() ctx: Context) {
        await ctx.scene.enter('g-sheets-settings-scene');
    }

    @Action('confirm_enable_auto_write')
    async onConfirmEnableAutoWrite(@Ctx() ctx: Context) {
        await this.updateAutoWriteStatus(ctx, true);
    }

    @Action('confirm_disable_auto_write')
    async onConfirmDisableAutoWrite(@Ctx() ctx: Context) {
        await this.updateAutoWriteStatus(ctx, false);
    }

    private async updateAutoWriteStatus(@Ctx() ctx: Context, enabled: boolean) {
        try {
            const gSheetsConfig = await this.prisma.setting.findUnique({
                where: { key: 'g_sheets_config' },
            });

            if (!gSheetsConfig) {
                await safeEditMessageText(
                    ctx,
                    '❌ Google Sheets sozlamalari topilmadi',
                    Markup.inlineKeyboard([
                        [Markup.button.callback('⬅️ Orqaga', 'configure_g_sheets_export')],
                    ]),
                    'Sheets topilmadi',
                );
                return;
            }

            const decryptedConfig = this.encryptionService.decrypt(gSheetsConfig.value);
            const config = JSON.parse(decryptedConfig);

            const updatedConfig = {
                ...config,
                autoWrite: enabled,
                lastModified: new Date().toISOString(),
            };

            const encryptedUpdatedConfig = this.encryptionService.encrypt(JSON.stringify(updatedConfig));

            await this.prisma.setting.update({
                where: { key: 'g_sheets_config' },
                data: { value: encryptedUpdatedConfig },
            });

            const statusText = enabled ? 'yoqildi' : 'o\'chirildi';
            const statusEmoji = enabled ? '✅' : '❌';

            await safeEditMessageText(
                ctx,
                `${statusEmoji} <b>Avtomatik yozish muvaffaqiyatli ${statusText}!</b>\n\n📊 <b>Sheet ID:</b> ${config.sheetId}\n📢 <b>Holat:</b> ${statusEmoji} ${statusText.charAt(0).toUpperCase() + statusText.slice(1)}\n⏰ <b>O'zgartirilgan:</b> ${new Date().toLocaleString('uz-UZ')}\n\n${enabled ? '🎉 Endi yangi orderlar avtomatik ravishda Google Sheets\'ga yoziladi!' : '⚠️ Avtomatik yozish to\'xtatildi.'}`,
                Markup.inlineKeyboard([
                    [Markup.button.callback("👁️ Ko'rish", 'view_sheets_config')],
                    [Markup.button.callback('⬅️ Orqaga', 'configure_g_sheets_export')],
                ]),
                'Avtomatik yozish o\'zgartirildi',
            );
        } catch (error) {
            await safeEditMessageText(
                ctx,
                `❌ Avtomatik yozish holatini o'zgartirishda xatolik yuz berdi`,
                Markup.inlineKeyboard([
                    [Markup.button.callback('🔄 Qayta urinish', enabled ? 'confirm_enable_auto_write' : 'confirm_disable_auto_write')],
                    [Markup.button.callback('⬅️ Orqaga', 'configure_g_sheets_export')],
                ]),
                'Xatolik',
            );
        }
    }

    @Action('delete_sheets_config')
    async onDeleteSheetsConfig(@Ctx() ctx: Context) {
        await safeEditMessageText(
            ctx,
            "🗑️ <b>Google Sheets sozlamalarini o'chirish</b>\n\n⚠️ Diqqat! Bu amal qaytarib bo'lmaydi.\n\nGoogle Sheets sozlamalarini o'chirishni tasdiqlaysizmi?",
            Markup.inlineKeyboard([
                [Markup.button.callback("✅ Ha, o'chirish", 'confirm_delete_sheets')],
                [Markup.button.callback("❌ Yo'q, bekor qilish", 'configure_g_sheets_export')],
            ]),
            "Sheets o'chirish tasdiqi",
        );
    }

    @Action('confirm_delete_sheets')
    async onConfirmDeleteSheets(@Ctx() ctx: Context) {
        try {
            await this.prisma.setting.delete({
                where: { key: 'g_sheets_config' },
            });

            await safeEditMessageText(
                ctx,
                "✅ Google Sheets sozlamalari muvaffaqiyatli o'chirildi",
                Markup.inlineKeyboard([
                    [Markup.button.callback('➕ Yangi sozlash', 'edit_sheets_config')],
                    [Markup.button.callback('⬅️ Orqaga', 'back_to_settings')],
                ]),
                "Sheets o'chirildi",
            );
        } catch (error) {
            await safeEditMessageText(
                ctx,
                "❌ Google Sheets sozlamalarini o'chirishda xatolik yuz berdi",
                Markup.inlineKeyboard([
                    [Markup.button.callback('🔄 Qayta urinish', 'confirm_delete_sheets')],
                    [Markup.button.callback('⬅️ Orqaga', 'configure_g_sheets_export')],
                ]),
                "O'chirish xatosi",
            );
        }
    }

    @Action('view_channel_config')
    async onViewChannelConfig(@Ctx() ctx: Context) {
        try {
            const channelConfig = await this.prisma.setting.findUnique({
                where: { key: 'channel_config' },
            });

            if (!channelConfig) {
                await safeEditMessageText(
                    ctx,
                    '❌ Kanal/Guruh sozlamalari topilmadi',
                    Markup.inlineKeyboard([
                        [Markup.button.callback('⬅️ Orqaga', 'configure_channel')],
                    ]),
                    'Kanal topilmadi',
                );
                return;
            }

            try {
                const decryptedConfig = this.encryptionService.decrypt(channelConfig.value);
                const config = JSON.parse(decryptedConfig);

                const statusEmoji = config.enabled ? '✅' : '❌';
                const statusText = config.enabled ? 'Yoqilgan' : "O'chirilgan";

                const configText =
                    `📢 <b>Kanal/Guruh sozlamalari:</b>\n\n` +
                    `📝 <b>Nomi:</b> ${config.chatTitle || "Noma'lum"}\n` +
                    `🆔 <b>Chat ID:</b> <code>${config.chatId || "Noma'lum"}</code>\n` +
                    `📊 <b>Turi:</b> ${config.chatType || "Noma'lum"}\n` +
                    `📢 <b>Xabarlar:</b> ${statusEmoji} ${statusText}\n` +
                    `📅 <b>Yaratilgan:</b> ${config.createdAt ? new Date(config.createdAt).toLocaleDateString('uz-UZ') : "Noma'lum"}\n` +
                    `🔄 <b>Yangilangan:</b> ${config.lastUpdated ? new Date(config.lastUpdated).toLocaleDateString('uz-UZ') : "Hech qachon"}\n` +
                    `✏️ <b>O'zgartirilgan:</b> ${config.lastModified ? new Date(config.lastModified).toLocaleDateString('uz-UZ') : "Hech qachon"}`;

                await safeEditMessageText(
                    ctx,
                    configText,
                    {
                        parse_mode: 'HTML',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('✏️ Tahrirlash', 'edit_channel_config')],
                            [Markup.button.callback("🗑️ O'chirish", 'delete_channel_config')],
                            [Markup.button.callback('⬅️ Orqaga', 'configure_channel')],
                        ]),
                    },
                    "Kanal ma'lumotlari",
                );
            } catch (decryptError) {
                await safeEditMessageText(
                    ctx,
                    "📢 <b>Kanal/Guruh sozlamalari:</b>\n\n✅ Sozlamalar mavjud va faol\n❌ Ma'lumotlarni o'qishda xatolik",
                    Markup.inlineKeyboard([
                        [Markup.button.callback('✏️ Tahrirlash', 'edit_channel_config')],
                        [Markup.button.callback("🗑️ O'chirish", 'delete_channel_config')],
                        [Markup.button.callback('⬅️ Orqaga', 'configure_channel')],
                    ]),
                    "Kanal ma'lumotlari",
                );
            }
        } catch (error) {
            await safeEditMessageText(
                ctx,
                "❌ Kanal/Guruh sozlamalarini ko'rishda xatolik yuz berdi",
                Markup.inlineKeyboard([
                    [Markup.button.callback('⬅️ Orqaga', 'configure_channel')],
                ]),
                'Xatolik',
            );
        }
    }

    @Action('edit_channel_config')
    async onEditChannelConfig(@Ctx() ctx: Context) {
        await ctx.scene.enter('channel-settings-scene');
    }

    @Action('delete_channel_config')
    async onDeleteChannelConfig(@Ctx() ctx: Context) {
        await safeEditMessageText(
            ctx,
            "🗑️ <b>Kanal/Guruh sozlamalarini o'chirish</b>\n\n⚠️ Diqqat! Bu amal qaytarib bo'lmaydi.\n\nKanal/Guruh sozlamalarini o'chirishni tasdiqlaysizmi?",
            Markup.inlineKeyboard([
                [Markup.button.callback("✅ Ha, o'chirish", 'confirm_delete_channel')],
                [Markup.button.callback("❌ Yo'q, bekor qilish", 'configure_channel')],
            ]),
            "Kanal o'chirish tasdiqi",
        );
    }

    @Action('confirm_delete_channel')
    async onConfirmDeleteChannel(@Ctx() ctx: Context) {
        try {
            await this.prisma.setting.delete({
                where: { key: 'channel_config' },
            });

            await safeEditMessageText(
                ctx,
                "✅ Kanal/Guruh sozlamalari muvaffaqiyatli o'chirildi",
                Markup.inlineKeyboard([
                    [Markup.button.callback('➕ Yangi sozlash', 'edit_channel_config')],
                    [Markup.button.callback('⬅️ Orqaga', 'back_to_settings')],
                ]),
                "Kanal o'chirildi",
            );
        } catch (error) {
            await safeEditMessageText(
                ctx,
                "❌ Kanal/Guruh sozlamalarini o'chirishda xatolik yuz berdi",
                Markup.inlineKeyboard([
                    [Markup.button.callback('🔄 Qayta urinish', 'confirm_delete_channel')],
                    [Markup.button.callback('⬅️ Orqaga', 'configure_channel')],
                ]),
                "O'chirish xatosi",
            );
        }
    }

    @Action('confirm_enable_notifications')
    async onConfirmEnableNotifications(@Ctx() ctx: Context) {
        await this.updateNotificationStatus(ctx, true);
    }

    @Action('confirm_disable_notifications')
    async onConfirmDisableNotifications(@Ctx() ctx: Context) {
        await this.updateNotificationStatus(ctx, false);
    }

    private async updateNotificationStatus(@Ctx() ctx: Context, enabled: boolean) {
        try {
            const channelConfig = await this.prisma.setting.findUnique({
                where: { key: 'channel_config' },
            });

            if (!channelConfig) {
                await safeEditMessageText(
                    ctx,
                    '❌ Kanal/Guruh sozlamalari topilmadi',
                    Markup.inlineKeyboard([
                        [Markup.button.callback('⬅️ Orqaga', 'configure_channel')],
                    ]),
                    'Kanal topilmadi',
                );
                return;
            }

            const decryptedConfig = this.encryptionService.decrypt(channelConfig.value);
            const config = JSON.parse(decryptedConfig);

            const updatedConfig = {
                ...config,
                enabled: enabled,
                lastModified: new Date().toISOString(),
            };

            const encryptedUpdatedConfig = this.encryptionService.encrypt(JSON.stringify(updatedConfig));

            await this.prisma.setting.update({
                where: { key: 'channel_config' },
                data: { value: encryptedUpdatedConfig },
            });

            const statusText = enabled ? 'yoqildi' : 'o\'chirildi';
            const statusEmoji = enabled ? '✅' : '❌';

            await safeEditMessageText(
                ctx,
                `${statusEmoji} <b>Xabarlar muvaffaqiyatli ${statusText}!</b>\n\n📝 <b>Chat:</b> ${config.chatTitle}\n🆔 <b>ID:</b> <code>${config.chatId}</code>\n📢 <b>Holat:</b> ${statusEmoji} ${statusText.charAt(0).toUpperCase() + statusText.slice(1)}\n⏰ <b>O'zgartirilgan:</b> ${new Date().toLocaleString('uz-UZ')}\n\n${enabled ? '🎉 Endi yangi orderlar avtomatik ravishda kanalga/guruhga yuboriladi!' : '⚠️ Order xabarlari to\'xtatildi.'}`,
                Markup.inlineKeyboard([
                    [Markup.button.callback("👁️ Ko'rish", 'view_channel_config')],
                    [Markup.button.callback('⬅️ Orqaga', 'configure_channel')],
                ]),
                'Xabarlar holati o\'zgartirildi',
            );
        } catch (error) {
            await safeEditMessageText(
                ctx,
                `❌ Xabarlar holatini o'zgartirishda xatolik yuz berdi`,
                Markup.inlineKeyboard([
                    [Markup.button.callback('🔄 Qayta urinish', enabled ? 'confirm_enable_notifications' : 'confirm_disable_notifications')],
                    [Markup.button.callback('⬅️ Orqaga', 'configure_channel')],
                ]),
                'Xatolik',
            );
        }
    }

    @Action('back_to_settings')
    async onBackToSettings(@Ctx() ctx: Context) {
        await safeEditMessageText(
            ctx,
            '⚙️ <b>Sozlamalar:</b>',
            Markup.inlineKeyboard(
                [
                    Markup.button.callback('📊 Sheets', 'configure_g_sheets_export'),
                    Markup.button.callback('📢 Kanal/Guruh', 'configure_channel'),
                ],
                {
                    columns: 1,
                },
            ),
            'Sozlamalar',
        );
    }
}
