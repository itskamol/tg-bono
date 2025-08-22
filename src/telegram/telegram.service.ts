import { Injectable } from '@nestjs/common';
import { Start, Update, Ctx, Command } from 'nestjs-telegraf';
import { Context } from '../interfaces/context.interface';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';
import { Markup } from 'telegraf';

@Update()
@Injectable()
export class TelegramService {
    constructor(private readonly prisma: PrismaService) {}

    @Start()
    async start(@Ctx() ctx: Context) {
        const telegramId = ctx.from?.id;

        if (!telegramId) {
            await ctx.reply('❌ Telegram ID topilmadi.');
            return;
        }

        // Check if user exists in database
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

        const commands = [
            { command: '/start', description: 'Botni ishga tushirish' },
            { command: '/help', description: 'Yordam' },
            { command: '/profile', description: "Profil ma'lumotlari" },
        ];

        if (user.role === Role.SUPER_ADMIN) {
            commands.push(
                { command: '/list_users', description: "Foydalanuvchilar ro'yxati" },
                { command: '/add_user', description: "Yangi foydalanuvchi qo'shish" },
                { command: '/edit_user', description: 'Foydalanuvchini tahrirlash' },
                { command: '/delete_user', description: "Foydalanuvchini o'chirish" },
                { command: '/list_branches', description: "Filiallar ro'yxati" },
                { command: '/add_branch', description: "Yangi filial qo'shish" },
                { command: '/edit_branch', description: 'Filialni tahrirlash' },
                { command: '/delete_branch', description: "Filialni o'chirish" },
                { command: '/list_products', description: "Mahsulotlar ro'yxati" },
                { command: '/add_product', description: "Yangi mahsulot qo'shish" },
                { command: '/edit_product', description: 'Mahsulotni tahrirlash' },
                { command: '/delete_product', description: "Mahsulotni o'chirish" },
                { command: '/list_orders', description: "Buyurtmalar ro'yxati" },
                { command: '/order_stats', description: 'Buyurtma statistikasi' },
                { command: '/reports', description: 'Batafsil hisobotlar' },
                { command: '/settings', description: 'Bot sozlamalari' },
            );
        } else if (user.role === Role.ADMIN) {
            commands.push(
                { command: '/list_users', description: 'Filial foydalanuvchilari' },
                { command: '/add_user', description: "Yangi kassir qo'shish" },
                { command: '/edit_user', description: 'Kassirni tahrirlash' },
                { command: '/delete_user', description: "Kassirni o'chirish" },
                { command: '/list_products', description: "Mahsulotlar ro'yxati" },
                { command: '/add_product', description: "Yangi mahsulot qo'shish" },
                { command: '/edit_product', description: 'Mahsulotni tahrirlash' },
                { command: '/delete_product', description: "Mahsulotni o'chirish" },
                { command: '/list_orders', description: "Buyurtmalar ro'yxati" },
                { command: '/order_stats', description: 'Buyurtma statistikasi' },
                { command: '/reports', description: 'Batafsil hisobotlar' },
            );
        } else if (user.role === Role.CASHIER) {
            commands.push(
                { command: '/neworder', description: 'Yangi buyurtma yaratish' },
                { command: '/list_orders', description: "Buyurtmalar ro'yxati" },
            );
        }

        await ctx.telegram.setMyCommands(commands);
        const keyboardButtons = commands.map((cmd) => Markup.button.text(cmd.command));
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

        let helpMessage = `
📋 Umumiy buyruqlar:
/start - Botni ishga tushirish
/help - Yordam
/profile - Profil ma'lumotlari

`;

        // Role-based commands
        if (user.role === Role.SUPER_ADMIN) {
            helpMessage += `
🔧 Super Admin buyruqlari:
/list_users - Foydalanuvchilar ro'yxati
/add_user - Yangi foydalanuvchi qo'shish
/edit_user - Foydalanuvchini tahrirlash
/delete_user - Foydalanuvchini o'chirish

🏪 Filiallar:
/list_branches - Filiallar ro'yxati
/add_branch - Yangi filial qo'shish
/edit_branch - Filialni tahrirlash
/delete_branch - Filialni o'chirish

📦 Mahsulotlar:
/list_products - Mahsulotlar ro'yxati
/add_product - Yangi mahsulot qo'shish
/edit_product - Mahsulotni tahrirlash
/delete_product - Mahsulotni o'chirish

📋 Buyurtmalar:
/list_orders - Buyurtmalar ro'yxati
/order_stats - Buyurtma statistikasi

📊 Hisobotlar:
/reports - Batafsil hisobotlar
`;
        } else if (user.role === Role.ADMIN) {
            helpMessage += `
👨‍💼 Admin buyruqlari:
/list_users - Filial foydalanuvchilari
/add_user - Yangi kassir qo'shish
/edit_user - Kassirni tahrirlash
/delete_user - Kassirni o'chirish

📦 Mahsulotlar:
/list_products - Mahsulotlar ro'yxati
/add_product - Yangi mahsulot qo'shish
/edit_product - Mahsulotni tahrirlash
/delete_product - Mahsulotni o'chirish

📋 Buyurtmalar:
/list_orders - Buyurtmalar ro'yxati
/order_stats - Buyurtma statistikasi

📊 Hisobotlar:
/reports - Batafsil hisobotlar
`;
        } else if (user.role === Role.CASHIER) {
            helpMessage += `
💰 Kassir buyruqlari:
/neworder - Yangi buyurtma yaratish
/list_orders - Buyurtmalar ro'yxati
`;
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
}
