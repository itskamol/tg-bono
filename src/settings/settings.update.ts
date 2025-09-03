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
            '⚙️ Sozlamalar:',
            Markup.inlineKeyboard(
                [
                    Markup.button.callback('📧 Email', 'configure_email_export'),
                    Markup.button.callback('📊 Sheets', 'configure_g_sheets_export'),
                    Markup.button.callback('📢 Kanal/Guruh', 'configure_channel'),
                    Markup.button.callback('⏰ Rejalashtirish', 'configure_schedule'),
                ],
                {
                    columns: 1,
                },
            ),
            'Sozlamalar',
        );
    }

    @Action('configure_email_export')
    async onConfigureEmailExport(@Ctx() ctx: Context) {
        // Mavjud email sozlamalarini tekshirish
        const emailConfig = await this.prisma.setting.findUnique({
            where: { key: 'email_config' },
        });

        if (emailConfig) {
            // Agar sozlamalar mavjud bo'lsa, CRUD menyusini ko'rsatish
            await safeEditMessageText(
                ctx,
                '📧 Email sozlamalari:\n\n✅ Email sozlamalari mavjud',
                Markup.inlineKeyboard([
                    [Markup.button.callback("👁️ Ko'rish", 'view_email_config')],
                    [Markup.button.callback('✏️ Tahrirlash', 'edit_email_config')],
                    [Markup.button.callback("🗑️ O'chirish", 'delete_email_config')],
                    [Markup.button.callback('⬅️ Orqaga', 'back_to_settings')],
                ]),
                'Email CRUD menyu',
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
            where: { key: 'g_sheets_config' },
        });

        if (gSheetsConfig) {
            // Agar sozlamalar mavjud bo'lsa, CRUD menyusini ko'rsatish
            await safeEditMessageText(
                ctx,
                '📊 Google Sheets sozlamalari:\n\n✅ Google Sheets sozlamalari mavjud',
                Markup.inlineKeyboard([
                    [Markup.button.callback("👁️ Ko'rish", 'view_sheets_config')],
                    [Markup.button.callback('✏️ Tahrirlash', 'edit_sheets_config')],
                    [Markup.button.callback("🗑️ O'chirish", 'delete_sheets_config')],
                    [Markup.button.callback('⬅️ Orqaga', 'back_to_settings')],
                ]),
                'Sheets CRUD menyu',
            );
        } else {
            // Agar sozlamalar yo'q bo'lsa, yangi yaratish
            await ctx.scene.enter('g-sheets-settings-scene');
        }
    }

    @Action('configure_channel')
    async onConfigureChannel(@Ctx() ctx: Context) {
        // Mavjud kanal sozlamalarini tekshirish
        const channelConfig = await this.prisma.setting.findUnique({
            where: { key: 'channel_config' },
        });

        if (channelConfig) {
            // Agar sozlamalar mavjud bo'lsa, CRUD menyusini ko'rsatish
            await safeEditMessageText(
                ctx,
                '📢 Kanal/Guruh sozlamalari:\n\n✅ Kanal/Guruh sozlamalari mavjud',
                Markup.inlineKeyboard([
                    [Markup.button.callback("👁️ Ko'rish", 'view_channel_config')],
                    [Markup.button.callback('✏️ Tahrirlash', 'edit_channel_config')],
                    [Markup.button.callback('🔄 Yangilash', 'refresh_channel_info')],
                    [Markup.button.callback('🔔 Xabarlar', 'toggle_channel_notifications')],
                    [Markup.button.callback('🧪 Test xabar', 'test_channel_message')],
                    [Markup.button.callback("🗑️ O'chirish", 'delete_channel_config')],
                    [Markup.button.callback('⬅️ Orqaga', 'back_to_settings')],
                ]),
                'Kanal CRUD menyu',
            );
        } else {
            // Agar sozlamalar yo'q bo'lsa, yangi yaratish
            await ctx.scene.enter('channel-settings-scene');
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
                where: { key: 'email_config' },
            });

            if (!emailConfig) {
                await safeEditMessageText(
                    ctx,
                    '❌ Email sozlamalari topilmadi',
                    Markup.inlineKeyboard([
                        [Markup.button.callback('⬅️ Orqaga', 'configure_email_export')],
                    ]),
                    'Email topilmadi',
                );
                return;
            }

            try {
                // Email sozlamalarini decrypt qilish
                const decryptedConfig = this.encryptionService.decrypt(emailConfig.value);
                const config = JSON.parse(decryptedConfig);

                const configText =
                    `📧 Email sozlamalari:\n\n` +
                    `📨 Jo'natuvchi: ${config.auth?.user || "Noma'lum"}\n` +
                    `📧 Qabul qiluvchilar: ${config.recipient || "Noma'lum"}\n` +
                    `🔗 SMTP Server: ${config.host || "Noma'lum"}:${config.port || "Noma'lum"}\n` +
                    `🔐 Xavfsizlik: ${config.secure ? 'SSL/TLS' : 'STARTTLS'}`;

                await safeEditMessageText(
                    ctx,
                    configText,
                    Markup.inlineKeyboard([
                        [Markup.button.callback('✏️ Tahrirlash', 'edit_email_config')],
                        [Markup.button.callback("🗑️ O'chirish", 'delete_email_config')],
                        [Markup.button.callback('⬅️ Orqaga', 'configure_email_export')],
                    ]),
                    "Email ma'lumotlari",
                );
            } catch (decryptError) {
                await safeEditMessageText(
                    ctx,
                    "📧 Email sozlamalari:\n\n✅ Sozlamalar mavjud va faol\n❌ Ma'lumotlarni o'qishda xatolik",
                    Markup.inlineKeyboard([
                        [Markup.button.callback('✏️ Tahrirlash', 'edit_email_config')],
                        [Markup.button.callback("🗑️ O'chirish", 'delete_email_config')],
                        [Markup.button.callback('⬅️ Orqaga', 'configure_email_export')],
                    ]),
                    "Email ma'lumotlari",
                );
            }
        } catch (error) {
            await safeEditMessageText(
                ctx,
                "❌ Email sozlamalarini ko'rishda xatolik yuz berdi",
                Markup.inlineKeyboard([
                    [Markup.button.callback('⬅️ Orqaga', 'configure_email_export')],
                ]),
                'Xatolik',
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
            "🗑️ Email sozlamalarini o'chirish\n\n⚠️ Diqqat! Bu amal qaytarib bo'lmaydi.\n\nEmail sozlamalarini o'chirishni tasdiqlaysizmi?",
            Markup.inlineKeyboard([
                [Markup.button.callback("✅ Ha, o'chirish", 'confirm_delete_email')],
                [Markup.button.callback("❌ Yo'q, bekor qilish", 'configure_email_export')],
            ]),
            "Email o'chirish tasdiqi",
        );
    }

    @Action('confirm_delete_email')
    async onConfirmDeleteEmail(@Ctx() ctx: Context) {
        try {
            await this.prisma.setting.delete({
                where: { key: 'email_config' },
            });

            await safeEditMessageText(
                ctx,
                "✅ Email sozlamalari muvaffaqiyatli o'chirildi",
                Markup.inlineKeyboard([
                    [Markup.button.callback('➕ Yangi sozlash', 'edit_email_config')],
                    [Markup.button.callback('⬅️ Orqaga', 'back_to_settings')],
                ]),
                "Email o'chirildi",
            );
        } catch (error) {
            await safeEditMessageText(
                ctx,
                "❌ Email sozlamalarini o'chirishda xatolik yuz berdi",
                Markup.inlineKeyboard([
                    [Markup.button.callback('🔄 Qayta urinish', 'confirm_delete_email')],
                    [Markup.button.callback('⬅️ Orqaga', 'configure_email_export')],
                ]),
                "O'chirish xatosi",
            );
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
                // Google Sheets sozlamalarini decrypt qilish
                const decryptedConfig = this.encryptionService.decrypt(gSheetsConfig.value);
                const config = JSON.parse(decryptedConfig);
                const credentials = JSON.parse(config.credentials);

                const configText =
                    `📊 Google Sheets sozlamalari:\n\n` +
                    `📋 Sheet ID: ${config.sheetId || "Noma'lum"}\n` +
                    `🔑 Service Account: ${credentials.client_email || "Noma'lum"}\n` +
                    `📁 Project ID: ${credentials.project_id || "Noma'lum"}\n` +
                    `🔐 Key Type: ${credentials.type || "Noma'lum"}`;

                await safeEditMessageText(
                    ctx,
                    configText,
                    Markup.inlineKeyboard([
                        [Markup.button.callback('✏️ Tahrirlash', 'edit_sheets_config')],
                        [Markup.button.callback("🗑️ O'chirish", 'delete_sheets_config')],
                        [Markup.button.callback('⬅️ Orqaga', 'configure_g_sheets_export')],
                    ]),
                    "Sheets ma'lumotlari",
                );
            } catch (decryptError) {
                await safeEditMessageText(
                    ctx,
                    "📊 Google Sheets sozlamalari:\n\n✅ Sozlamalar mavjud va faol\n❌ Ma'lumotlarni o'qishda xatolik",
                    Markup.inlineKeyboard([
                        [Markup.button.callback('✏️ Tahrirlash', 'edit_sheets_config')],
                        [Markup.button.callback("🗑️ O'chirish", 'delete_sheets_config')],
                        [Markup.button.callback('⬅️ Orqaga', 'configure_g_sheets_export')],
                    ]),
                    "Sheets ma'lumotlari",
                );
            }
        } catch (error) {
            await safeEditMessageText(
                ctx,
                "❌ Google Sheets sozlamalarini ko'rishda xatolik yuz berdi",
                Markup.inlineKeyboard([
                    [Markup.button.callback('⬅️ Orqaga', 'configure_g_sheets_export')],
                ]),
                'Xatolik',
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
            "🗑️ Google Sheets sozlamalarini o'chirish\n\n⚠️ Diqqat! Bu amal qaytarib bo'lmaydi.\n\nGoogle Sheets sozlamalarini o'chirishni tasdiqlaysizmi?",
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
                // Kanal sozlamalarini decrypt qilish
                const decryptedConfig = this.encryptionService.decrypt(channelConfig.value);
                const config = JSON.parse(decryptedConfig);

                const statusEmoji = config.enabled ? '✅' : '❌';
                const statusText = config.enabled ? 'Yoqilgan' : "O'chirilgan";

                const configText =
                    `📢 Kanal/Guruh sozlamalari:\n\n` +
                    `📝 Nomi: ${config.chatTitle || "Noma'lum"}\n` +
                    `🆔 Chat ID: <code>${config.chatId || "Noma'lum"}</code>\n` +
                    `📊 Turi: ${config.chatType || "Noma'lum"}\n` +
                    `📢 Xabarlar: ${statusEmoji} ${statusText}\n` +
                    `📅 Yaratilgan: ${config.createdAt ? new Date(config.createdAt).toLocaleDateString('uz-UZ') : "Noma'lum"}\n` +
                    `🔄 Yangilangan: ${config.lastUpdated ? new Date(config.lastUpdated).toLocaleDateString('uz-UZ') : "Hech qachon"}\n` +
                    `✏️ O'zgartirilgan: ${config.lastModified ? new Date(config.lastModified).toLocaleDateString('uz-UZ') : "Hech qachon"}`;

                await safeEditMessageText(
                    ctx,
                    configText,
                    {
                        parse_mode: 'HTML',
                        reply_markup: Markup.inlineKeyboard([
                            [Markup.button.callback('✏️ Tahrirlash', 'edit_channel_config')],
                            [Markup.button.callback('🔄 Yangilash', 'refresh_channel_info')],
                            [Markup.button.callback('🔔 Xabarlar', 'toggle_channel_notifications')],
                            [Markup.button.callback('🧪 Test xabar', 'test_channel_message')],
                            [Markup.button.callback("🗑️ O'chirish", 'delete_channel_config')],
                            [Markup.button.callback('⬅️ Orqaga', 'configure_channel')],
                        ]).reply_markup,
                    },
                    "Kanal ma'lumotlari",
                );
            } catch (decryptError) {
                await safeEditMessageText(
                    ctx,
                    "📢 Kanal/Guruh sozlamalari:\n\n✅ Sozlamalar mavjud va faol\n❌ Ma'lumotlarni o'qishda xatolik",
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
            "🗑️ Kanal/Guruh sozlamalarini o'chirish\n\n⚠️ Diqqat! Bu amal qaytarib bo'lmaydi.\n\nKanal/Guruh sozlamalarini o'chirishni tasdiqlaysizmi?",
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

    @Action('refresh_channel_info')
    async onRefreshChannelInfo(@Ctx() ctx: Context) {
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

            await safeEditMessageText(
                ctx,
                '🔄 Kanal/Guruh ma\'lumotlari yangilanmoqda...',
                undefined,
                'Yangilanmoqda',
            );

            try {
                // Yangi chat ma'lumotlarini olish
                const chatInfo = await ctx.telegram.getChat(config.chatId);

                // Yangilangan ma'lumotlarni saqlash
                const updatedConfig = {
                    ...config,
                    chatTitle: 'title' in chatInfo ? chatInfo.title : 'Private Chat',
                    chatType: chatInfo.type,
                    lastUpdated: new Date().toISOString(),
                };

                const encryptedUpdatedConfig = this.encryptionService.encrypt(JSON.stringify(updatedConfig));

                await this.prisma.setting.update({
                    where: { key: 'channel_config' },
                    data: { value: encryptedUpdatedConfig },
                });

                await safeEditMessageText(
                    ctx,
                    `✅ Kanal/Guruh ma'lumotlari yangilandi!\n\n📝 Yangi nom: ${updatedConfig.chatTitle}\n📊 Turi: ${updatedConfig.chatType}\n🆔 ID: ${config.chatId}\n⏰ Yangilangan: ${new Date().toLocaleString('uz-UZ')}`,
                    Markup.inlineKeyboard([
                        [Markup.button.callback("👁️ Ko'rish", 'view_channel_config')],
                        [Markup.button.callback('⬅️ Orqaga', 'configure_channel')],
                    ]),
                    'Ma\'lumotlar yangilandi',
                );
            } catch (error) {
                let errorMessage = '❌ Kanal/Guruh ma\'lumotlarini yangilashda xatolik:';

                if (error instanceof Error) {
                    if (error.message.includes('chat not found')) {
                        errorMessage += '\n• Chat topilmadi';
                    } else if (error.message.includes('bot was blocked')) {
                        errorMessage += '\n• Bot chatdan chiqarilgan';
                    } else {
                        errorMessage += `\n• ${error.message}`;
                    }
                }

                await safeEditMessageText(
                    ctx,
                    errorMessage,
                    Markup.inlineKeyboard([
                        [Markup.button.callback('🔄 Qayta urinish', 'refresh_channel_info')],
                        [Markup.button.callback('⬅️ Orqaga', 'configure_channel')],
                    ]),
                    'Yangilash xatosi',
                );
            }
        } catch (error) {
            await safeEditMessageText(
                ctx,
                '❌ Sozlamalarni o\'qishda xatolik yuz berdi',
                Markup.inlineKeyboard([
                    [Markup.button.callback('⬅️ Orqaga', 'configure_channel')],
                ]),
                'Xatolik',
            );
        }
    }

    @Action('toggle_channel_notifications')
    async onToggleChannelNotifications(@Ctx() ctx: Context) {
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

            const currentStatus = config.enabled;
            const newStatus = !currentStatus;
            const statusText = newStatus ? 'yoqildi' : 'o\'chirildi';
            const statusEmoji = newStatus ? '✅' : '❌';

            await safeEditMessageText(
                ctx,
                `🔔 Xabarlar holati o'zgartirilsinmi?\n\n📝 Chat: ${config.chatTitle}\n🆔 ID: ${config.chatId}\n\n📢 Joriy holat: ${config.enabled ? '✅ Yoqilgan' : '❌ O\'chirilgan'}\n📢 Yangi holat: ${statusEmoji} ${statusText.charAt(0).toUpperCase() + statusText.slice(1)}`,
                Markup.inlineKeyboard([
                    [Markup.button.callback(`${statusEmoji} Ha, ${statusText}`, newStatus ? 'confirm_enable_notifications' : 'confirm_disable_notifications')],
                    [Markup.button.callback('❌ Bekor qilish', 'configure_channel')],
                ]),
                'Xabarlar holati',
            );
        } catch (error) {
            await safeEditMessageText(
                ctx,
                '❌ Sozlamalarni o\'qishda xatolik yuz berdi',
                Markup.inlineKeyboard([
                    [Markup.button.callback('⬅️ Orqaga', 'configure_channel')],
                ]),
                'Xatolik',
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

            // Yangilangan konfiguratsiya
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
                `${statusEmoji} Xabarlar muvaffaqiyatli ${statusText}!\n\n📝 Chat: ${config.chatTitle}\n🆔 ID: ${config.chatId}\n📢 Holat: ${statusEmoji} ${statusText.charAt(0).toUpperCase() + statusText.slice(1)}\n⏰ O'zgartirilgan: ${new Date().toLocaleString('uz-UZ')}\n\n${enabled ? '🎉 Endi yangi orderlar avtomatik ravishda kanalga/guruhga yuboriladi!' : '⚠️ Order xabarlari to\'xtatildi.'}`,
                Markup.inlineKeyboard([
                    [Markup.button.callback("👁️ Ko'rish", 'view_channel_config')],
                    [Markup.button.callback('🧪 Test xabar', 'test_channel_message')],
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

    @Action('test_channel_message')
    async onTestChannelMessage(@Ctx() ctx: Context) {
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

            if (!config.enabled) {
                await safeEditMessageText(
                    ctx,
                    '⚠️ Kanal/Guruh xabarlari o\'chirilgan\n\nAvval xabarlarni yoqing, keyin test xabar yuboring.',
                    Markup.inlineKeyboard([
                        [Markup.button.callback('✏️ Tahrirlash', 'edit_channel_config')],
                        [Markup.button.callback('⬅️ Orqaga', 'configure_channel')],
                    ]),
                    'Xabarlar o\'chirilgan',
                );
                return;
            }

            // Test xabar yuborish
            const testMessage = `🧪 Test xabar\n\n📅 Sana: ${new Date().toLocaleString('uz-UZ')}\n✅ Bot muvaffaqiyatli ishlayapti!`;

            await ctx.telegram.sendMessage(config.chatId, testMessage);

            await safeEditMessageText(
                ctx,
                `✅ Test xabar muvaffaqiyatli yuborildi!\n\n📝 Kanal: ${config.chatTitle}\n🆔 ID: ${config.chatId}`,
                Markup.inlineKeyboard([
                    [Markup.button.callback('🔄 Yana test', 'test_channel_message')],
                    [Markup.button.callback('⬅️ Orqaga', 'configure_channel')],
                ]),
                'Test muvaffaqiyatli',
            );
        } catch (error) {
            let errorMessage = '❌ Test xabar yuborishda xatolik:';

            if (error instanceof Error) {
                if (error.message.includes('chat not found')) {
                    errorMessage += '\n• Chat topilmadi';
                } else if (error.message.includes('bot was blocked')) {
                    errorMessage += '\n• Bot chatdan chiqarilgan';
                } else if (error.message.includes('not enough rights')) {
                    errorMessage += '\n• Botda xabar yuborish huquqi yo\'q';
                } else {
                    errorMessage += `\n• ${error.message}`;
                }
            }

            await safeEditMessageText(
                ctx,
                errorMessage,
                Markup.inlineKeyboard([
                    [Markup.button.callback('🔄 Qayta urinish', 'test_channel_message')],
                    [Markup.button.callback('✏️ Sozlamalarni yangilash', 'edit_channel_config')],
                    [Markup.button.callback('⬅️ Orqaga', 'configure_channel')],
                ]),
                'Test xatosi',
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
                    Markup.button.callback('📢 Kanal/Guruh', 'configure_channel'),
                    Markup.button.callback('⏰ Rejalashtirish', 'configure_schedule'),
                ],
                {
                    columns: 1,
                },
            ),
            'Sozlamalar',
        );
    }
}
