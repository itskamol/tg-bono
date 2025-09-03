import { Injectable, OnModuleInit } from '@nestjs/common';
import { Start, Update, Ctx, Command, On, InjectBot } from 'nestjs-telegraf';
import { Context } from '../interfaces/context.interface';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';
import { Markup, Telegraf } from 'telegraf';
import { UsersUpdate } from '../users/users.update';
import { BranchesUpdate } from '../branches/branches.update';
import { CategoriesUpdate } from '../categories/categories.update';
import { SidesUpdate } from '../sides/sides.update';
import { OrdersUpdate } from '../orders/orders.update';
import { ReportsUpdate } from '../reports/reports.update';
import { SettingsUpdate } from '../settings/settings.update';

import { Public } from 'src/auth/decorators/public.decorator';

@Update()
@Injectable()
export class TelegramService implements OnModuleInit {
    constructor(
        @InjectBot() private readonly bot: Telegraf<Context>,
        private readonly prisma: PrismaService,
        private readonly usersUpdate: UsersUpdate,
        private readonly branchesUpdate: BranchesUpdate,
        private readonly categoriesUpdate: CategoriesUpdate,
        private readonly sidesUpdate: SidesUpdate,
        private readonly ordersUpdate: OrdersUpdate,
        private readonly reportsUpdate: ReportsUpdate,
        private readonly settingsUpdate: SettingsUpdate,
    ) { }

    async onModuleInit() {
        // Bot initialize bo'lganda default commandlarni set qilish
        await this.setDefaultCommands();
    }

    private async setDefaultCommands() {
        try {
            const commands = [
                {
                    command: 'start',
                    description: 'Botni ishga tushirish va asosiy menyu',
                },
                {
                    command: 'help',
                    description: "Yordam va buyruqlar ro'yxati",
                },
                {
                    command: 'getchatid',
                    description: 'Chat ID ni olish (kanal/guruh sozlamalari uchun)',
                },
                {
                    command: 'getme',
                    description: "Telegram ma'lumotlaringizni ko'rish",
                },
            ];

            await this.bot.telegram.setMyCommands(commands);
        } catch (error) {
            console.error("❌ Bot commands o'rnatishda xatolik:", error);
        }
    }

    @Public()
    @Start()
    async start(@Ctx() ctx: Context) {
        const telegramId = ctx.from?.id;

        if (!telegramId) {
            await ctx.reply('❌ Telegram ID topilmadi.');
            return;
        }

        const user = await this.prisma.user.findUnique({
            where: { telegram_id: telegramId },
            include: { branch: true },
        });

        if (!user) {
            const welcomeMessage = `
🤖 Assalomu alaykum! Botiga xush kelibsiz!

❗️ Siz hali tizimda ro'yxatdan o'tmagansiz.
Admin sizni tizimga qo'shishi kerak.

📞 Admin bilan bog'laning
            `;
            await ctx.reply(welcomeMessage);
            return;
        }

        const roleText =
            {
                [Role.SUPER_ADMIN]: 'Super Admin',
                [Role.ADMIN]: 'Admin',
                [Role.CASHIER]: 'Kassir',
            }[user.role] || user.role;

        const startMessage = `
🤖 Assalomu alaykum, ${user.full_name}!

👤 Sizning ma'lumotlaringiz:
• Rol: ${roleText}
• Filial: ${user.branch?.name || 'Tayinlanmagan'}
        `;

        // Rolga qarab tugmalarni tashkil qilamiz
        let keyboardButtons: string[][] = [];

        if (user.role === Role.SUPER_ADMIN) {
            keyboardButtons = [
                ['👥 Foydalanuvchilar', '🏢 Filiallar'],
                ['📦 Kategoriyalar'],
                ['📋 Buyurtmalar', '📊 Hisobotlar'],
                ['👤 Profil', '⚙️ Sozlamalar'],
            ];
        } else if (user.role === Role.ADMIN) {
            keyboardButtons = [
                ['👥 Foydalanuvchilar', '🏢 Filiallar'],
                ['📋 Buyurtmalar', '📊 Hisobotlar'],
                ['📦 Kategoriyalar', '👤 Profil'],
            ];
        } else if (user.role === Role.CASHIER) {
            keyboardButtons = [['➕ Yangi'], ['📋 Buyurtmalar', '👤 Profil']];
        }

        await ctx.reply(startMessage, Markup.keyboard(keyboardButtons).resize().persistent());
    }

    @Public()
    @Command('getchatid')
    async getChatId(@Ctx() ctx: Context) {
        const chatId = ctx.chat?.id;
        const chatType = ctx.chat?.type;
        const chatTitle = 'title' in ctx.chat ? ctx.chat.title : 'Private Chat';

        let message = `🆔 Chat ma'lumotlari:\n\n`;
        message += `📊 Turi: ${chatType}\n`;
        message += `🆔 Chat ID: <code>${chatId}</code>\n`;

        if (chatType !== 'private') {
            message += `📝 Nom: ${chatTitle}\n`;
        }

        message += `\n💡 Chat ID'ni nusxalash uchun ustiga bosing!`;

        if (chatType === 'group' || chatType === 'supergroup' || chatType === 'channel') {
            message += `\n\n⚙️ Bu ID'ni bot sozlamalarida ishlatishingiz mumkin:\n/settings → 📢 Kanal/Guruh`;
        }

        await ctx.reply(message, { parse_mode: 'HTML' });
    }

    @Public()
    @Command('help')
    async help(@Ctx() ctx: Context) {
        const helpMessage = `
🤖 Bot buyruqlari:

/start - Botni ishga tushirish va asosiy menyu
/help - Yordam va buyruqlar ro'yxati
/getchatid - Chat ID ni olish (kanal/guruh sozlamalari uchun)
/getme - Telegram ma'lumotlaringizni ko'rish
/profile - Profil ma'lumotlarini ko'rish

💡 Maslahatlar:
• Tugmalardan foydalaning - bu eng oson yo'l
• Kanal/guruh sozlamalari uchun /getchatid dan foydalaning
• Muammolar bo'lsa /start ni bosing

📞 Yordam kerak bo'lsa admin bilan bog'laning
        `;

        await ctx.reply(helpMessage);
    }

    @Public()
    @Command('getme')
    async getMe(@Ctx() ctx: Context) {
        const user = ctx.from;

        if (!user) {
            await ctx.reply('❌ Foydalanuvchi ma\'lumotlari topilmadi.');
            return;
        }

        let message = `👤 Sizning Telegram ma'lumotlaringiz:\n\n`;

        // Asosiy ma'lumotlar
        message += `🆔 ID: <code>${user.id}</code>\n`;
        message += `👤 Ism: ${user.first_name}\n`;

        if (user.last_name) {
            message += `📝 Familiya: ${user.last_name}\n`;
        }

        if (user.username) {
            message += `🔗 Username: @${user.username}\n`;
        }

        // Til kodi
        if (user.language_code) {
            message += `🌐 Til: ${user.language_code}\n`;
        }

        // Premium status
        if ('is_premium' in user && user.is_premium) {
            message += `⭐ Premium: Ha\n`;
        }

        // Bot status
        if ('is_bot' in user && user.is_bot) {
            message += `🤖 Bot: Ha\n`;
        }

        // Chat ma'lumotlari
        message += `\n💬 Chat ma'lumotlari:\n`;
        message += `🆔 Chat ID: <code>${ctx.chat?.id}</code>\n`;
        message += `📊 Chat turi: ${ctx.chat?.type}\n`;

        if (ctx.chat?.type !== 'private' && 'title' in ctx.chat && ctx.chat.title) {
            message += `📝 Chat nomi: ${ctx.chat.title}\n`;
        }

        // Vaqt ma'lumoti
        message += `\n⏰ So'rov vaqti: ${new Date().toLocaleString('uz-UZ')}\n`;

        message += `\n💡 Bu ma'lumotlar sizning Telegram profilingizdan olingan.`;

        await ctx.reply(message, { parse_mode: 'HTML' });
    }

    @Command('profile')
    async profile(@Ctx() ctx: Context) {
        const telegramId = ctx.from?.id;

        if (!telegramId) {
            await ctx.reply('❌ Telegram ID topilmadi.');
            return;
        }

        const user = await this.prisma.user.findUnique({
            where: { telegram_id: telegramId },
            include: { branch: true },
        });

        if (!user) {
            await ctx.reply("❌ Siz tizimda ro'yxatdan o'tmagansiz.");
            return;
        }

        const roleText =
            {
                [Role.SUPER_ADMIN]: 'Super Admin',
                [Role.ADMIN]: 'Admin',
                [Role.CASHIER]: 'Kassir',
            }[user.role] || user.role;

        const profileMessage = `
👤 Profil ma'lumotlari:

📝 To'liq ism: ${user.full_name}
🎭 Rol: ${roleText}
🏪 Filial: ${user.branch?.name || 'Tayinlanmagan'}
📍 Filial manzili: ${user.branch?.address || 'N/A'}
📅 Ro'yxatdan o'tgan: ${user.created_at.toLocaleDateString('uz-UZ')}
        `;

        await ctx.reply(profileMessage);
    }

    @On('text')
    async onText(@Ctx() ctx: Context) {
        const text = (ctx.message as any).text;

        // Foydalanuvchi ma'lumotlarini olish va buttonTextMap ni dinamik yaratish
        const telegramId = ctx.from?.id;
        if (!telegramId) {
            await ctx.reply('❌ Telegram ID topilmadi.');
            return;
        }

        const user = await this.prisma.user.findUnique({
            where: { telegram_id: telegramId },
            include: { branch: true },
        });

        if (!user) {
            await ctx.reply("❌ Siz tizimda ro'yxatdan o'tmagansiz. /start buyrug'ini bosing.");
            return;
        }

        // Rolga qarab buttonTextMap ni yaratish
        let currentButtonTextMap: { [key: string]: string } = {};

        if (user.role === Role.SUPER_ADMIN) {
            currentButtonTextMap = {
                '👥 Foydalanuvchilar': 'users',
                '🏢 Filiallar': 'branches',
                '📦 Kategoriyalar': 'categories',
                '📋 Buyurtmalar': 'orders',
                '📊 Hisobotlar': 'reports',
                '👤 Profil': 'profile',
                '⚙️ Sozlamalar': 'settings',
            };
        } else if (user.role === Role.ADMIN) {
            currentButtonTextMap = {
                '👥 Xodimlar': 'users',
                '📋 Buyurtmalar': 'orders',
                '📊 Hisobotlar': 'reports',
                '👤 Profil': 'profile',
            };
        } else if (user.role === Role.CASHIER) {
            currentButtonTextMap = {
                '➕ Yangi': 'neworder',
                '📋 Buyurtmalar': 'orders',
                '👤 Profil': 'profile',
            };
        }

        const command = currentButtonTextMap[text];
        if (command) {
            switch (command) {
                case 'profile':
                    await this.profile(ctx);
                    break;
                case 'users':
                    await this.usersUpdate.listUsers(ctx);
                    break;
                case 'branches':
                    await this.branchesUpdate.listBranches(ctx);
                    break;
                case 'orders':
                    await this.ordersUpdate.listOrders(ctx);
                    break;
                case 'reports':
                    await this.reportsUpdate.showReports(ctx);
                    break;
                case 'settings':
                    await this.settingsUpdate.onSettings(ctx);
                    break;
                case 'categories':
                    await this.categoriesUpdate.listCategories(ctx);
                    break;
                case 'sides':
                    await this.sidesUpdate.listSides(ctx);
                    break;
                case 'neworder':
                    await this.ordersUpdate.onNewOrder(ctx);
                    break;
                default:
                    await ctx.reply('Kechirasiz, bu tugmaga mos funksiya hali yaratilmagan.');
                    break;
            }
        } else {
            // await ctx.reply(
            //     'Kechirasiz, siz yuborgan xabar tushunarsiz. Iltimos, tugmalardan foydalaning yoki /start bosing.',
            // );
        }
    }
}
