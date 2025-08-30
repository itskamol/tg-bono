import { Scene, SceneEnter, On, Message, Ctx, Action } from 'nestjs-telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../encryption.service';
import { EmailService } from '../../email/email.service';
import { Context } from '../../interfaces/context.interface';
import { Markup } from 'telegraf';

@Scene('email-settings-scene')
export class EmailSettingsScene {
    constructor(
        private readonly prisma: PrismaService,
        private readonly encryptionService: EncryptionService,
        private readonly emailService: EmailService,
    ) {}

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        await ctx.reply(
            'Email eksport sozlamalarini boshlash...',
            Markup.inlineKeyboard([
                Markup.button.callback('❌ Bekor qilish', 'cancel_email_config')
            ])
        );
        await ctx.reply('SMTP host manzilini kiriting (masalan: smtp.gmail.com).');
    }

    @On('text')
    async onText(@Ctx() ctx: Context, @Message('text') text: string) {
        const sceneState = ctx.scene.state as any;

        if (!sceneState.host) {
            sceneState.host = text;
            await ctx.reply(
                `Host "${text}" ga o'rnatildi. Endi SMTP portini kiriting (masalan: 587).`,
                Markup.inlineKeyboard([
                    Markup.button.callback('⬅️ Orqaga', 'back_to_host'),
                    Markup.button.callback('❌ Bekor qilish', 'cancel_email_config')
                ])
            );
            return;
        }

        if (!sceneState.port) {
            const port = parseInt(text, 10);
            if (isNaN(port)) {
                await ctx.reply('Noto\'g\'ri port. Iltimos, raqam kiriting.');
                return;
            }
            sceneState.port = port;
            await ctx.reply(
                `Port ${port} ga o'rnatildi. Endi foydalanuvchi nomini kiriting (jo'natuvchi email manzili).`,
                Markup.inlineKeyboard([
                    Markup.button.callback('⬅️ Orqaga', 'back_to_port'),
                    Markup.button.callback('❌ Bekor qilish', 'cancel_email_config')
                ])
            );
            return;
        }

        if (!sceneState.user) {
            sceneState.user = text;
            await ctx.reply(
                `Foydalanuvchi nomi "${text}" ga o'rnatildi. Endi parolni kiriting.`,
                Markup.inlineKeyboard([
                    Markup.button.callback('⬅️ Orqaga', 'back_to_user'),
                    Markup.button.callback('❌ Bekor qilish', 'cancel_email_config')
                ])
            );
            return;
        }

        if (!sceneState.pass) {
            sceneState.pass = text;
            await ctx.reply(
                `Parol qabul qilindi. Nihoyat, qabul qiluvchining email manzilini kiriting. Masalan: john@gmail.com`,
                Markup.inlineKeyboard([
                    Markup.button.callback('⬅️ Orqaga', 'back_to_pass'),
                    Markup.button.callback('❌ Bekor qilish', 'cancel_email_config')
                ])
            );
            return;
        }

        if (!sceneState.recipient) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            const emails = text.split(',').map((e) => e.trim());
            for (const email of emails) {
                if (!emailRegex.test(email)) {
                    await ctx.reply(`Noto'g'ri email manzil: ${email}. Iltimos, to'g'ri email kiriting.`);
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
                await ctx.reply('❌ Email ulanishini tekshirishda xatolik yuz berdi. Sozlamalarni tekshiring va qayta urinib ko\'ring.');
                return;
            }

            await this.prisma.setting.upsert({
                where: { key: 'email_config' },
                update: { value: encryptedConfig },
                create: { key: 'email_config', value: encryptedConfig },
            });

            await ctx.reply('✅ Email eksport sozlamalari muvaffaqiyatli saqlandi va ulanish tekshirildi!');
            await ctx.scene.leave();
        }
    }

    @Action('back_to_host')
    async onBackToHost(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as any;
        delete sceneState.host;
        await ctx.editMessageText('SMTP host manzilini kiriting (masalan: smtp.gmail.com).');
    }

    @Action('back_to_port')
    async onBackToPort(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as any;
        delete sceneState.port;
        await ctx.editMessageText(`Host: "${sceneState.host}". SMTP portini kiriting (masalan: 587).`);
    }

    @Action('back_to_user')
    async onBackToUser(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as any;
        delete sceneState.user;
        await ctx.editMessageText(`Port: ${sceneState.port}. Foydalanuvchi nomini kiriting (jo'natuvchi email manzili).`);
    }

    @Action('back_to_pass')
    async onBackToPass(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as any;
        delete sceneState.pass;
        await ctx.editMessageText(`Foydalanuvchi nomi: "${sceneState.user}". Parolni kiriting.`);
    }

    @Action('cancel_email_config')
    async onCancel(@Ctx() ctx: Context) {
        await ctx.editMessageText('❌ Email sozlamalari bekor qilindi.');
        await ctx.scene.leave();
    }
}