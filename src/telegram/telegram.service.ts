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
import { safeEditMessageText } from '../utils/telegram.utils';

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
    ) { }



    private buttonTextMap: { [key: string]: string } = {};

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
                ['📦 Kategoriyalar', '🍕 Xizmatlar'],
                ['📋 Buyurtmalar', '📊 Hisobotlar'],
                ['👤 Profil', '⚙️ Sozlamalar']
            ];

            // Button mapping for Super Admin
            this.buttonTextMap = {
                '👥 Foydalanuvchilar': 'users',
                '🏢 Filiallar': 'branches',
                '📦 Kategoriyalar': 'categories',
                '🍕 Xizmatlar': 'sides',
                '📋 Buyurtmalar': 'orders',
                '📊 Hisobotlar': 'reports',
                '👤 Profil': 'profile',
                '⚙️ Sozlamalar': 'settings'
            };
        } else if (user.role === Role.ADMIN) {
            keyboardButtons = [
                ['👥 Xodimlar', '🍕 Mahsulotlar'],
                ['📋 Buyurtmalar', '📊 Hisobotlar'],
                ['👤 Profil']
            ];

            // Button mapping for Admin
            this.buttonTextMap = {
                '👥 Xodimlar': 'users',
                '🍕 Mahsulotlar': 'sides',
                '📋 Buyurtmalar': 'orders',
                '📊 Hisobotlar': 'reports',
                '👤 Profil': 'profile'
            };
        } else if (user.role === Role.CASHIER) {
            keyboardButtons = [
                ['➕ Yangi buyurtma'],
                ['📋 Buyurtmalar', '👤 Profil']
            ];

            // Button mapping for Cashier
            this.buttonTextMap = {
                '➕ Yangi buyurtma': 'neworder',
                '📋 Buyurtmalar': 'orders',
                '👤 Profil': 'profile'
            };
        }

        await ctx.reply(
            startMessage,
            Markup.keyboard(keyboardButtons).resize().persistent(),
        );
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
            await ctx.reply(
                "Kechirasiz, siz yuborgan xabar tushunarsiz. Iltimos, tugmalardan foydalaning.",
            );
        }
    }
}
