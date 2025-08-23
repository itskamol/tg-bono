import { Injectable } from '@nestjs/common';
import { Start, Update, Ctx, Command, On } from 'nestjs-telegraf';
import { Context } from '../interfaces/context.interface';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';
import { Markup } from 'telegraf';
import { UsersUpdate } from '../users/users.update';
import { BranchesUpdate } from '../branches/branches.update';
import { CategoriesUpdate } from '../categories/categories.update';
import { SidesUpdate } from '../sides/sides.update';
import { OrdersUpdate } from '../orders/orders.update';
import { ReportsUpdate } from '../reports/reports.update';
import { SettingsUpdate } from '../settings/settings.update';

@Update()
@Injectable()
export class TelegramService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly usersUpdate: UsersUpdate,
        private readonly branchesUpdate: BranchesUpdate,
        private readonly categoriesUpdate: CategoriesUpdate,
        private readonly sidesUpdate: SidesUpdate,
        private readonly ordersUpdate: OrdersUpdate,
        private readonly reportsUpdate: ReportsUpdate,
        private readonly settingsUpdate: SettingsUpdate,
    ) {}

    // Emoji va buyruq matnlarini bog'laydigan xarita
    emojiMap: { [key: string]: string } = {
        start: '🚀',
        help: '❓',
        profile: '👤',
        users: '👥',
        branches: '🏢',
        orders: '📋',
        reports: '📊',
        settings: '⚙️',
        categories: '📦',
        sides: '🍕',
        products: '🍔',
        neworder: '➕',
    };

    // Tugma matnlarini buyruqlarga moslashtiruvchi xarita.
    // Bu xarita `@Start` metodida to'ldiriladi va `@On('text')`da ishlatiladi.
    private buttonTextMap: { [key: string]: string } = {
        '🚀 Botni ishga tushirish': 'start',
        '❓ Yordam': 'help',
        "👤 Profil ma'lumotlari": 'profile',
        "👥 Foydalanuvchilar ro'yxati": 'users',
        "🏢 Filiallar ro'yxati": 'branches',
        "📋 Buyurtmalar ro'yxati": 'orders',
        '📊 Batafsil hisobotlar': 'reports',
        '⚙️ Bot sozlamalari': 'settings',
        "📦 Kategoriyalar ro'yxati": 'categories',
        "🍕 Xizmatlar ro'yxati": 'sides',
    };

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
                🤖 Assalomu alaykum! TG-Bono botiga xush kelibsiz!

                ❗️ Siz hali tizimda ro'yxatdan o'tmagansiz.
                Admin sizni tizimga qo'shishi kerak.

                📞 Admin bilan bog'laning: @admin_username
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

            📋 Mavjud buyruqlar uchun /help yuboring.
        `;

        // Foydalanuvchi rolidan kelib chiqib, buyruqlar ro'yxatini yaratamiz
        const commands = [
            { command: 'start', description: 'Botni ishga tushirish' },
            { command: 'help', description: 'Yordam' },
            { command: 'profile', description: "Profil ma'lumotlari" },
        ];

        if (user.role === Role.SUPER_ADMIN) {
            commands.push(
                { command: 'users', description: "Foydalanuvchilar ro'yxati" },
                { command: 'branches', description: "Filiallar ro'yxati" },
                { command: 'orders', description: "Buyurtmalar ro'yxati" },
                { command: 'reports', description: 'Batafsil hisobotlar' },
                { command: 'settings', description: 'Bot sozlamalari' },
                { command: 'categories', description: "Kategoriyalar ro'yxati" },
                { command: 'sides', description: "Xizmatlar ro'yxati" },
            );
        } else if (user.role === Role.ADMIN) {
            commands.push(
                { command: 'users', description: 'Filial foydalanuvchilari' },
                { command: 'products', description: "Mahsulotlar ro'yxati" },
                { command: 'orders', description: "Buyurtmalar ro'yxati" },
                { command: 'reports', description: 'Batafsil hisobotlar' },
            );
        } else if (user.role === Role.CASHIER) {
            commands.push(
                { command: 'neworder', description: 'Yangi buyurtma yaratish' },
                { command: 'orders', description: "Buyurtmalar ro'yxati" },
            );
        }

        // setMyCommands metodiga `command` va `description` obyekti to'g'ri formatda uzatiladi
        const setCommands = commands.map((cmd) => ({
            command: cmd.command,
            description: cmd.description,
        }));
        await ctx.telegram.setMyCommands(setCommands);

        // Klaviatura uchun tugma matnlarini emojilar bilan birgalikda yaratamiz
        const keyboardButtons = commands.map((cmd) => {
            const emoji = this.emojiMap[cmd.command] || '➡️';
            const buttonText = `${emoji} ${cmd.description}`;
            this.buttonTextMap[buttonText] = cmd.command;
            return buttonText;
        });
        await ctx.reply(
            startMessage,
            Markup.keyboard(keyboardButtons, { columns: 2 }).resize().persistent(),
        );
    }

    @Command('help')
    async help(@Ctx() ctx: Context) {
        const telegramId = ctx.from?.id;

        if (!telegramId) {
            await ctx.reply('❌ Telegram ID topilmadi.');
            return;
        }

        const user = await this.prisma.user.findUnique({
            where: { telegram_id: telegramId },
        });

        if (!user) {
            await ctx.reply("❌ Siz tizimda ro'yxatdan o'tmagansiz. Admin bilan bog'laning.");
            return;
        }

        // Rolga qarab buyruqlar ro'yxatini yaratamiz
        const commandsList = [
            { command: 'start', description: 'Botni ishga tushirish' },
            { command: 'help', description: 'Yordam' },
            { command: 'profile', description: "Profil ma'lumotlari" },
        ];

        if (user.role === Role.SUPER_ADMIN) {
            commandsList.push(
                { command: 'users', description: 'Foydalanuvchilar boshqaruvi' },
                { command: 'branches', description: 'Filiallar boshqaruvi' },
                { command: 'sides', description: 'Xizmatlar boshqaruvi' },
                { command: 'categories', description: 'Kategoriyalar boshqaruvi' },
                { command: 'orders', description: "Buyurtmalar ro'yxati" },
                { command: 'reports', description: 'Batafsil hisobotlar' },
            );
        } else if (user.role === Role.ADMIN) {
            commandsList.push(
                { command: 'users', description: 'Filial foydalanuvchilari' },
                { command: 'products', description: "Mahsulotlar ro'yxati" },
                { command: 'orders', description: "Buyurtmalar ro'yxati" },
                { command: 'reports', description: 'Batafsil hisobotlar' },
            );
        } else if (user.role === Role.CASHIER) {
            commandsList.push(
                { command: 'neworder', description: 'Yangi buyurtma yaratish' },
                { command: 'orders', description: "Buyurtmalar ro'yxati" },
            );
        }

        let helpMessage = '📋 Mavjud buyruqlar:\n\n';
        for (const cmd of commandsList) {
            const emoji = this.emojiMap[cmd.command] || '➡️';
            helpMessage += `${emoji} /${cmd.command} - ${cmd.description}\n`;
        }

        await ctx.reply(helpMessage);
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
        const command = this.buttonTextMap[text];
        if (command) {
            switch (command) {
                case 'start':
                    await this.start(ctx);
                    break;
                case 'help':
                    await this.help(ctx);
                    break;
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
                    await ctx.reply('Kechirasiz, bu buyruqqa mos funksiya hali yaratilmagan.');
                    break;
            }
        } else {
            await ctx.reply(
                "Kechirasiz, siz yuborgan xabar tushunarsiz. /help buyrug'idan foydalaning.",
            );
        }
    }
}
