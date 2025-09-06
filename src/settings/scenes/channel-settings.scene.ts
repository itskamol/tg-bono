import { Scene, SceneEnter, On, Message, Ctx, Action } from 'nestjs-telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../encryption.service';
import { Context } from '../../interfaces/context.interface';
import { Markup } from 'telegraf';
import { safeReplyOrEdit } from '../../utils/telegram.utils';

@Scene('channel-settings-scene')
export class ChannelSettingsScene {
    constructor(
        private readonly prisma: PrismaService,
        private readonly encryptionService: EncryptionService,
    ) { }

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        const helpMessage = `📢 <b>Kanal/Guruh sozlamalari</b>

🆔 Kanal yoki guruh <b>Chat ID</b> sini kiriting:

💡 <b>Chat ID ni olish usullari:</b>

1️⃣ <b>Eng oson usul:</b>
   • Botni kanal/guruhga admin qiling
   • Kanal/guruhda <code>/getchatid</code> yuboring
   • Chat ID ni nusxalab oling

2️⃣ <b>Boshqa usullar:</b>
   • @userinfobot dan foydalaning
   • @RawDataBot dan foydalaning
   • Telegram Web URL dan oling

📝 <b>Misol:</b> <code>-1001234567890</code>`;

        await safeReplyOrEdit(
            ctx,
            helpMessage,
            Markup.inlineKeyboard([
                Markup.button.callback('❌ Bekor qilish', 'cancel_channel_config'),
            ]),
            'Kanal sozlamalari',
        );
    }

    @On('text')
    async onText(@Ctx() ctx: Context, @Message('text') text: string) {
        const sceneState = ctx.scene.state as any;

        if (!sceneState.chatId) {
            const chatId = text.trim();

            if (!/^-?\d+$/.test(chatId)) {
                await safeReplyOrEdit(
                    ctx,
                    '❌ <b>Noto\'g\'ri Chat ID formati.</b>\n\nChat ID raqam bo\'lishi kerak (masalan: <code>-1001234567890</code>)',
                    undefined,
                    'Noto\'g\'ri format',
                );
                return;
            }

            sceneState.chatId = chatId;

            await safeReplyOrEdit(
                ctx,
                '🔄 Chat ID tekshirilmoqda va bot ruxsatlari sinovdan o\'tkazilmoqda...',
                undefined,
                'Tekshirilmoqda',
            );

            try {
                const chatInfo = await ctx.telegram.getChat(chatId);

                const testMessage = '🧪 Bot sozlamalari test xabari\n\n✅ Bot muvaffaqiyatli ulandi!';
                await ctx.telegram.sendMessage(chatId, testMessage);

                sceneState.chatTitle = 'title' in chatInfo ? chatInfo.title : 'Private Chat';
                sceneState.chatType = chatInfo.type;

                await safeReplyOrEdit(
                    ctx,
                    `✅ <b>Chat topildi va test xabari yuborildi!</b>\n\n📝 <b>Chat nomi:</b> ${sceneState.chatTitle}\n📊 <b>Turi:</b> ${sceneState.chatType}\n🆔 <b>ID:</b> <code>${chatId}</code>\n\n📢 Yangi orderlar uchun xabar yuborishni yoqasizmi?`,
                    Markup.inlineKeyboard([
                        [Markup.button.callback('✅ Ha, yoqish', 'enable_notifications')],
                        [Markup.button.callback('❌ Yo\'q, o\'chirish', 'disable_notifications')],
                        [Markup.button.callback('🔙 Orqaga', 'back_to_chat_id')],
                        [Markup.button.callback('❌ Bekor qilish', 'cancel_channel_config')]
                    ]),
                    'Chat topildi',
                );
            } catch (error) {
                let errorMessage = '❌ <b>Chat ID bilan bog\'lanishda xatolik:</b>';

                if (error instanceof Error) {
                    if (error.message.includes('chat not found')) {
                        errorMessage += '\n• Chat topilmadi. ID ni tekshiring.';
                    } else if (error.message.includes('bot was blocked')) {
                        errorMessage += '\n• Bot chatdan chiqarilgan.';
                    } else if (error.message.includes('not enough rights')) {
                        errorMessage += '\n• Botda xabar yuborish huquqi yo\'q.';
                    } else if (error.message.includes('bot is not a member')) {
                        errorMessage += '\n• Bot chat a\'zosi emas.';
                    } else {
                        errorMessage += `\n• ${error.message}`;
                    }
                }

                errorMessage += '\n\n💡 Botni kanal/guruhga admin qilib qo\'ying va qaytadan urinib ko\'ring.';

                await safeReplyOrEdit(
                    ctx,
                    errorMessage,
                    Markup.inlineKeyboard([
                        [Markup.button.callback('🔄 Qaytadan urinish', 'retry_chat_id')],
                        [Markup.button.callback('❌ Bekor qilish', 'cancel_channel_config')]
                    ]),
                    'Chat xatosi',
                );
            }
        }
    }

    @Action('enable_notifications')
    async onEnableNotifications(@Ctx() ctx: Context) {
        await this.saveChannelConfig(ctx, true);
    }

    @Action('disable_notifications')
    async onDisableNotifications(@Ctx() ctx: Context) {
        await this.saveChannelConfig(ctx, false);
    }

    private async saveChannelConfig(@Ctx() ctx: Context, enabled: boolean) {
        const sceneState = ctx.scene.state as any;

        try {
            const channelConfig = {
                chatId: sceneState.chatId,
                chatTitle: sceneState.chatTitle,
                chatType: sceneState.chatType,
                enabled: enabled,
                createdAt: new Date().toISOString(),
            };

            const encryptedConfig = this.encryptionService.encrypt(JSON.stringify(channelConfig));

            await this.prisma.setting.upsert({
                where: { key: 'channel_config' },
                update: { value: encryptedConfig },
                create: { key: 'channel_config', value: encryptedConfig },
            });

            const statusText = enabled ? 'yoqildi' : 'o\'chirildi';
            const statusEmoji = enabled ? '✅' : '❌';

            await safeReplyOrEdit(
                ctx,
                `${statusEmoji} <b>Kanal/Guruh sozlamalari muvaffaqiyatli saqlandi!</b>\n\n📝 <b>Chat:</b> ${sceneState.chatTitle}\n🆔 <b>ID:</b> <code>${sceneState.chatId}</code>\n📢 <b>Xabarlar:</b> ${statusText}\n\n${enabled ? '🎉 Endi yangi orderlar avtomatik ravishda kanalga/guruhga yuboriladi!' : '⚠️ Order xabarlari o\'chirildi.'}`,
                undefined,
                'Sozlamalar saqlandi',
            );
            await ctx.scene.leave();
        } catch (error) {
            await safeReplyOrEdit(
                ctx,
                '❌ Sozlamalarni saqlashda xatolik yuz berdi.\n\nQaytadan urinib ko\'ring.',
                Markup.inlineKeyboard([
                    [Markup.button.callback('🔄 Qaytadan', enabled ? 'enable_notifications' : 'disable_notifications')],
                    [Markup.button.callback('❌ Bekor qilish', 'cancel_channel_config')]
                ]),
                'Saqlash xatosi',
            );
        }
    }

    @Action('back_to_chat_id')
    async onBackToChatId(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as any;
        delete sceneState.chatId;
        delete sceneState.chatTitle;
        delete sceneState.chatType;

        await this.onSceneEnter(ctx);
    }

    @Action('retry_chat_id')
    async onRetryChatId(@Ctx() ctx: Context) {
        await this.onBackToChatId(ctx);
    }

    @Action('cancel_channel_config')
    async onCancel(@Ctx() ctx: Context) {
        await safeReplyOrEdit(
            ctx,
            '❌ Kanal/Guruh sozlamalari bekor qilindi.',
            undefined,
            'Bekor qilindi',
        );
        await ctx.scene.leave();
    }
}