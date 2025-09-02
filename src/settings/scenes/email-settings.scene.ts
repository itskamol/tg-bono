import { Scene, SceneEnter, On, Message, Ctx, Action } from 'nestjs-telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../encryption.service';
import { EmailService } from '../../email/email.service';
import { Context } from '../../interfaces/context.interface';
import { Markup } from 'telegraf';
import { safeReplyOrEdit } from '../../utils/telegram.utils';

@Scene('email-settings-scene')
export class EmailSettingsScene {
    constructor(
        private readonly prisma: PrismaService,
        private readonly encryptionService: EncryptionService,
        private readonly emailService: EmailService,
    ) {}

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        await safeReplyOrEdit(
            ctx,
            '📧 Email eksport sozlamalarini boshlash...\n\nSMTP host manzilini kiriting (masalan: smtp.gmail.com).',
            Markup.inlineKeyboard([
                Markup.button.callback('❌ Bekor qilish', 'cancel_email_config')
            ]),
            'Email sozlamalari'
        );
    }

    @On('text')
    async onText(@Ctx() ctx: Context, @Message('text') text: string) {
        const sceneState = ctx.scene.state as any;

        if (!sceneState.host) {
            sceneState.host = text;
            await safeReplyOrEdit(
                ctx,
                `✅ Host "${text}" ga o'rnatildi.\n\nEndi SMTP portini kiriting (masalan: 587).`,
                Markup.inlineKeyboard([
                    Markup.button.callback('⬅️ Orqaga', 'back_to_host'),
                    Markup.button.callback('❌ Bekor qilish', 'cancel_email_config')
                ]),
                'Host saqlandi'
            );
            return;
        }

        if (!sceneState.port) {
            const port = parseInt(text, 10);
            if (isNaN(port)) {
                await safeReplyOrEdit(ctx, '❌ Noto\'g\'ri port. Iltimos, raqam kiriting.', undefined, 'Noto\'g\'ri port');
                return;
            }
            sceneState.port = port;
            await safeReplyOrEdit(
                ctx,
                `✅ Port ${port} ga o'rnatildi.\n\nEndi foydalanuvchi nomini kiriting (jo'natuvchi email manzili).`,
                Markup.inlineKeyboard([
                    Markup.button.callback('⬅️ Orqaga', 'back_to_port'),
                    Markup.button.callback('❌ Bekor qilish', 'cancel_email_config')
                ]),
                'Port saqlandi'
            );
            return;
        }

        if (!sceneState.user) {
            sceneState.user = text;
            await safeReplyOrEdit(
                ctx,
                `✅ Foydalanuvchi nomi "${text}" ga o'rnatildi.\n\nEndi parolni kiriting.`,
                Markup.inlineKeyboard([
                    Markup.button.callback('⬅️ Orqaga', 'back_to_user'),
                    Markup.button.callback('❌ Bekor qilish', 'cancel_email_config')
                ]),
                'Foydalanuvchi saqlandi'
            );
            return;
        }

        if (!sceneState.pass) {
            sceneState.pass = text;
            await safeReplyOrEdit(
                ctx,
                `✅ Parol qabul qilindi.\n\nNihoyat, qabul qiluvchining email manzilini kiriting.\nMasalan: john@gmail.com`,
                Markup.inlineKeyboard([
                    Markup.button.callback('⬅️ Orqaga', 'back_to_pass'),
                    Markup.button.callback('❌ Bekor qilish', 'cancel_email_config')
                ]),
                'Parol saqlandi'
            );
            return;
        }

        if (!sceneState.recipient) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            const emails = text.split(',').map((e) => e.trim());
            for (const email of emails) {
                if (!emailRegex.test(email)) {
                    await safeReplyOrEdit(ctx, `❌ Noto'g'ri email manzil: ${email}.\nIltimos, to'g'ri email kiriting.`, undefined, 'Noto\'g\'ri email');
                    return;
                }
            }
            sceneState.recipient = emails.join(', ');

            const emailConfig = {
                host: sceneState.host,
                port: sceneState.port,
                secure: sceneState.port === 465,
                auth: {
                    user: sceneState.user,
                    pass: sceneState.pass,
                },
                recipient: sceneState.recipient,
            };

            const encryptedConfig = this.encryptionService.encrypt(JSON.stringify(emailConfig));

            // Test connection before saving
            const testResult = await this.emailService.testConnection(emailConfig);
            
            if (!testResult) {
                await safeReplyOrEdit(ctx, '❌ Email ulanishini tekshirishda xatolik yuz berdi.\nSozlamalarni tekshiring va qayta urinib ko\'ring.', undefined, 'Ulanish xatosi');
                return;
            }

            await this.prisma.setting.upsert({
                where: { key: 'email_config' },
                update: { value: encryptedConfig },
                create: { key: 'email_config', value: encryptedConfig },
            });

            await safeReplyOrEdit(ctx, '✅ Email eksport sozlamalari muvaffaqiyatli saqlandi va ulanish tekshirildi!', undefined, 'Sozlamalar saqlandi');
            await ctx.scene.leave();
        }
    }

    @Action('back_to_host')
    async onBackToHost(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as any;
        delete sceneState.host;
        await safeReplyOrEdit(
            ctx,
            '📧 Email eksport sozlamalarini boshlash...\n\nSMTP host manzilini kiriting (masalan: smtp.gmail.com).',
            Markup.inlineKeyboard([
                Markup.button.callback('❌ Bekor qilish', 'cancel_email_config')
            ]),
            'Host qaytarish'
        );
    }

    @Action('back_to_port')
    async onBackToPort(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as any;
        delete sceneState.port;
        await safeReplyOrEdit(
            ctx,
            `✅ Host: "${sceneState.host}"\n\nSMTP portini kiriting (masalan: 587).`,
            Markup.inlineKeyboard([
                Markup.button.callback('⬅️ Orqaga', 'back_to_host'),
                Markup.button.callback('❌ Bekor qilish', 'cancel_email_config')
            ]),
            'Port qaytarish'
        );
    }

    @Action('back_to_user')
    async onBackToUser(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as any;
        delete sceneState.user;
        await safeReplyOrEdit(
            ctx,
            `✅ Port: ${sceneState.port}\n\nFoydalanuvchi nomini kiriting (jo'natuvchi email manzili).`,
            Markup.inlineKeyboard([
                Markup.button.callback('⬅️ Orqaga', 'back_to_port'),
                Markup.button.callback('❌ Bekor qilish', 'cancel_email_config')
            ]),
            'User qaytarish'
        );
    }

    @Action('back_to_pass')
    async onBackToPass(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as any;
        delete sceneState.pass;
        await safeReplyOrEdit(
            ctx,
            `✅ Foydalanuvchi nomi: "${sceneState.user}"\n\nParolni kiriting.`,
            Markup.inlineKeyboard([
                Markup.button.callback('⬅️ Orqaga', 'back_to_user'),
                Markup.button.callback('❌ Bekor qilish', 'cancel_email_config')
            ]),
            'Parol qaytarish'
        );
    }

    @Action('cancel_email_config')
    async onCancel(@Ctx() ctx: Context) {
        await safeReplyOrEdit(ctx, '❌ Email sozlamalari bekor qilindi.', undefined, 'Bekor qilindi');
        await ctx.scene.leave();
    }
}