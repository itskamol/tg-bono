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
            "📧 Email eksport sozlamalari\n\n📨 Jo'natuvchi email manzilini kiriting (masalan: your-email@gmail.com):",
            Markup.inlineKeyboard([
                Markup.button.callback('❌ Bekor qilish', 'cancel_email_config'),
            ]),
            'Email sozlamalari',
        );
    }

    @On('text')
    async onText(@Ctx() ctx: Context, @Message('text') text: string) {
        const sceneState = ctx.scene.state as any;

        // Step 1: Jo'natuvchi email
        if (!sceneState.senderEmail) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(text.trim())) {
                await safeReplyOrEdit(
                    ctx,
                    "❌ Noto'g'ri email format. To'g'ri email kiriting (masalan: your-email@gmail.com):",
                    undefined,
                    "Noto'g'ri email",
                );
                return;
            }
            sceneState.senderEmail = text.trim();
            await safeReplyOrEdit(
                ctx,
                `✅ Jo'natuvchi email: ${text.trim()}\n\n🔐 Email parolini kiriting (Gmail uchun App Password):`,
                Markup.inlineKeyboard([
                    Markup.button.callback('⬅️ Orqaga', 'back_to_sender'),
                    Markup.button.callback('❌ Bekor qilish', 'cancel_email_config'),
                ]),
                'Email saqlandi',
            );
            return;
        }

        // Step 2: Parol
        if (!sceneState.password) {
            if (text.trim().length < 4) {
                await safeReplyOrEdit(
                    ctx,
                    '❌ Parol juda qisqa. Kamida 4 ta belgi kiriting:',
                    undefined,
                    'Qisqa parol',
                );
                return;
            }
            sceneState.password = text.trim();
            await safeReplyOrEdit(
                ctx,
                `✅ Parol saqlandi\n\n📧 Qabul qiluvchi email manzil(lar)ini kiriting.\n\nBir nechta email uchun vergul bilan ajrating:\nMasalan: admin@company.com, manager@company.com`,
                Markup.inlineKeyboard([
                    Markup.button.callback('⬅️ Orqaga', 'back_to_password'),
                    Markup.button.callback('❌ Bekor qilish', 'cancel_email_config'),
                ]),
                'Parol saqlandi',
            );
            return;
        }

        // Step 3: Qabul qiluvchi email(lar)
        if (!sceneState.recipients) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            const emails = text
                .split(',')
                .map((e) => e.trim())
                .filter((e) => e.length > 0);

            if (emails.length === 0) {
                await safeReplyOrEdit(
                    ctx,
                    '❌ Kamida bitta email manzil kiriting:',
                    undefined,
                    "Email yo'q",
                );
                return;
            }

            for (const email of emails) {
                if (!emailRegex.test(email)) {
                    await safeReplyOrEdit(
                        ctx,
                        `❌ Noto'g'ri email manzil: "${email}"\nBarcha emaillarni to'g'ri formatda kiriting:`,
                        undefined,
                        "Noto'g'ri email",
                    );
                    return;
                }
            }

            sceneState.recipients = emails.join(', ');

            // Gmail uchun default SMTP sozlamalari
            const emailConfig = {
                host: 'smtp.gmail.com',
                port: 587,
                secure: false,
                auth: {
                    user: sceneState.senderEmail,
                    pass: sceneState.password,
                },
                recipient: sceneState.recipients,
            };

            const encryptedConfig = this.encryptionService.encrypt(JSON.stringify(emailConfig));

            // Test connection before saving
            await safeReplyOrEdit(
                ctx,
                '🔄 Email ulanishini tekshirish...',
                undefined,
                'Tekshirish',
            );

            const testResult = await this.emailService.testConnection(emailConfig);

            if (!testResult) {
                await safeReplyOrEdit(
                    ctx,
                    "❌ Email ulanishini tekshirishda xatolik!\n\n💡 Gmail uchun:\n1. 2-bosqichli tasdiqlashni yoqing\n2. App Password yarating\n3. App Password ni parol sifatida ishlating\n\nQayta urinib ko'ring:",
                    Markup.inlineKeyboard([
                        Markup.button.callback('⬅️ Orqaga', 'back_to_recipients'),
                        Markup.button.callback('❌ Bekor qilish', 'cancel_email_config'),
                    ]),
                    'Ulanish xatosi',
                );
                return;
            }

            await this.prisma.setting.upsert({
                where: { key: 'email_config' },
                update: { value: encryptedConfig },
                create: { key: 'email_config', value: encryptedConfig },
            });

            await safeReplyOrEdit(
                ctx,
                `✅ Email sozlamalari muvaffaqiyatli saqlandi!\n\n📨 Jo'natuvchi: ${sceneState.senderEmail}\n📧 Qabul qiluvchilar: ${sceneState.recipients}\n🔗 SMTP: Gmail (smtp.gmail.com:587)\n\nEndi hisobotlar avtomatik emailga yuboriladi.`,
                undefined,
                'Sozlamalar saqlandi',
            );
            await ctx.scene.leave();
        }
    }

    @Action('back_to_sender')
    async onBackToSender(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as any;
        delete sceneState.senderEmail;
        await safeReplyOrEdit(
            ctx,
            "📧 Email eksport sozlamalari\n\n📨 Jo'natuvchi email manzilini kiriting (masalan: your-email@gmail.com):",
            Markup.inlineKeyboard([
                Markup.button.callback('❌ Bekor qilish', 'cancel_email_config'),
            ]),
            'Sender qaytarish',
        );
    }

    @Action('back_to_password')
    async onBackToPassword(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as any;
        delete sceneState.password;
        await safeReplyOrEdit(
            ctx,
            `✅ Jo'natuvchi email: ${sceneState.senderEmail}\n\n🔐 Email parolini kiriting (Gmail uchun App Password):`,
            Markup.inlineKeyboard([
                Markup.button.callback('⬅️ Orqaga', 'back_to_sender'),
                Markup.button.callback('❌ Bekor qilish', 'cancel_email_config'),
            ]),
            'Password qaytarish',
        );
    }

    @Action('back_to_recipients')
    async onBackToRecipients(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as any;
        delete sceneState.recipients;
        await safeReplyOrEdit(
            ctx,
            `✅ Parol saqlandi\n\n📧 Qabul qiluvchi email manzil(lar)ini kiriting.\n\nBir nechta email uchun vergul bilan ajrating:\nMasalan: admin@company.com, manager@company.com`,
            Markup.inlineKeyboard([
                Markup.button.callback('⬅️ Orqaga', 'back_to_password'),
                Markup.button.callback('❌ Bekor qilish', 'cancel_email_config'),
            ]),
            'Recipients qaytarish',
        );
    }

    @Action('cancel_email_config')
    async onCancel(@Ctx() ctx: Context) {
        await safeReplyOrEdit(
            ctx,
            '❌ Email sozlamalari bekor qilindi.',
            undefined,
            'Bekor qilindi',
        );
        await ctx.scene.leave();
    }
}
