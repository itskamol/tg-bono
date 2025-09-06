import { Update, Command, Ctx, Action } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { Roles } from '../auth/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { Context } from '../interfaces/context.interface';
import { Role, User } from '@prisma/client';
import { safeEditMessageText } from '../utils/telegram.utils';

@Update()
export class UsersUpdate {
    constructor(private readonly prisma: PrismaService) { }

    @Command('users')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN)
    async listUsers(@Ctx() ctx: Context) {
        const user = ctx.user;
        let users: User[] = [];

        if (user.role === Role.SUPER_ADMIN) {
            users = await this.prisma.user.findMany({
                include: { branch: true },
                orderBy: { full_name: 'asc' },
            });
        } else if (user.role === Role.ADMIN) {
            if (!user.branch_id) {
                await ctx.reply('❌ Siz hech qanday filialga tayinlanmagansiz.', { parse_mode: 'HTML' });
                return;
            }
            users = await this.prisma.user.findMany({
                where: { branch_id: user.branch_id },
                include: { branch: true },
                orderBy: { full_name: 'asc' },
            });
        }

        if (!users || users.length === 0) {
            await ctx.reply(
                '❌ Hech qanday foydalanuvchi mavjud emas.',
                {
                    parse_mode: 'HTML', ...Markup.inlineKeyboard([
                        Markup.button.callback("➕ Foydalanuvchi qo'shish", 'ADD_USER'),
                    ])
                },
            );
            return;
        }

        const userButtons = users.map((u) => {
            const roleEmoji =
            {
                [Role.SUPER_ADMIN]: '👑',
                [Role.ADMIN]: '👨‍💼',
                [Role.CASHIER]: '💰',
            }[u.role] || '👤';

            return Markup.button.callback(`${roleEmoji} ${u.full_name}`, `VIEW_USER_${u.id}`);
        });

        await ctx.reply(
            `👥 <b>Foydalanuvchilar ro'yxati (${users.length} ta):</b>`,
            {
                parse_mode: 'HTML', ...Markup.inlineKeyboard(
                    [...userButtons, Markup.button.callback('➕ Yangi', 'ADD_USER')],
                    { columns: 2 },
                )
            },
        );
    }

    @Action('ADD_USER')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN)
    async onAddUser(@Ctx() ctx: Context) {
        await ctx.scene.enter('add-user-scene');
    }

    @Action(/^VIEW_USER_(.+)$/)
    @Roles(Role.SUPER_ADMIN, Role.ADMIN)
    async onViewUser(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) {
            return;
        }
        const userData = ctx.callbackQuery.data;

        const match = userData.match(/^VIEW_USER_(.+)$/);
        if (!match) {
            await safeEditMessageText(ctx, "❌ Noto'g'ri ma'lumot.", undefined, 'Xatolik');
            return;
        }

        const userId = match[1];
        const currentUser = ctx.user;

        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: {
                branch: true,
                _count: {
                    select: { orders: true },
                },
            },
        });

        if (!user) {
            await safeEditMessageText(
                ctx,
                '❌ Foydalanuvchi topilmadi.',
                undefined,
                'Foydalanuvchi topilmadi',
            );
            return;
        }

        if (currentUser.role === Role.ADMIN) {
            if (user.branch_id !== currentUser.branch_id || user.role !== Role.CASHIER) {
                await safeEditMessageText(
                    ctx,
                    "❌ Bu foydalanuvchini ko'rish huquqingiz yo'q.",
                    undefined,
                    "Ruxsat yo'q",
                );
                return;
            }
        }

        const roleText =
        {
            [Role.SUPER_ADMIN]: '👑 Super Admin',
            [Role.ADMIN]: '👨‍💼 Admin',
            [Role.CASHIER]: '💰 Kassir',
        }[user.role] || user.role;

        const userDetails = `
👤 <b>Foydalanuvchi ma'lumotlari:</b>

👤 <b>To'liq ism:</b> ${user.full_name}
🔰 <b>Rol:</b> ${roleText}
🏪 <b>Filial:</b> ${user.branch?.name || 'Tayinlanmagan'}
🆔 <b>Telegram ID:</b> <code>${user.telegram_id}</code>
📊 <b>Buyurtmalar:</b> ${user._count.orders} ta
📅 <b>Ro'yxatdan o'tgan:</b> ${user.created_at.toLocaleDateString('uz-UZ')}

Nima qilmoqchisiz?
        `;

        const buttons = [];

        if (
            currentUser.role === Role.SUPER_ADMIN ||
            (currentUser.role === Role.ADMIN &&
                user.role === Role.CASHIER &&
                user.branch_id === currentUser.branch_id)
        ) {
            buttons.push(Markup.button.callback('✏️ Tahrirlash', `EDIT_USER_${user.id}`));
        }

        if (
            currentUser.role === Role.SUPER_ADMIN ||
            (currentUser.role === Role.ADMIN &&
                user.role === Role.CASHIER &&
                user.branch_id === currentUser.branch_id)
        ) {
            buttons.push(Markup.button.callback("🗑️ O'chirish", `DELETE_USER_${user.id}`));
        }

        buttons.push(Markup.button.callback('🔙 Orqaga', 'BACK_TO_USERS'));

        await safeEditMessageText(ctx, userDetails, Markup.inlineKeyboard(buttons, { columns: 2 }));
    }

    @Action(/^EDIT_USER_(.+)$/)
    @Roles(Role.SUPER_ADMIN, Role.ADMIN)
    async onEditUser(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) {
            return;
        }
        const userData = ctx.callbackQuery.data;

        const match = userData.match(/^EDIT_USER_(.+)$/);
        if (!match) {
            await safeEditMessageText(ctx, "❌ Noto'g'ri ma'lumot.");
            return;
        }

        const userId = match[1];

        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: { branch: true },
        });

        if (!user) {
            await safeEditMessageText(ctx, '❌ Foydalanuvchi topilmadi.');
            return;
        }

        ctx.scene.state = {
            userId,
            userName: user.full_name,
            userBranchId: user.branch_id,
            userRole: user.role,
        };
        await ctx.scene.enter('edit-user-scene', ctx.scene.state);
    }

    @Action(/^DELETE_USER_(.+)$/)
    @Roles(Role.SUPER_ADMIN, Role.ADMIN)
    async onDeleteUser(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) {
            return;
        }
        const userData = ctx.callbackQuery.data;

        const match = userData.match(/^DELETE_USER_(.+)$/);
        if (!match) {
            await safeEditMessageText(ctx, "❌ Noto'g'ri ma'lumot.");
            return;
        }

        const userId = match[1];

        ctx.scene.state = { userId };
        await ctx.scene.enter('delete-user-scene', ctx.scene.state);
    }

    @Action('BACK_TO_USERS')
    @Roles(Role.SUPER_ADMIN, Role.ADMIN)
    async onBackToUsers(@Ctx() ctx: Context) {
        const currentUser = ctx.user;
        let users: User[] = [];

        if (currentUser.role === Role.SUPER_ADMIN) {
            users = await this.prisma.user.findMany({
                include: { branch: true },
                orderBy: { full_name: 'asc' },
            });
        } else if (currentUser.role === Role.ADMIN) {
            if (!currentUser.branch_id) {
                await safeEditMessageText(ctx, '❌ Siz hech qanday filialga tayinlanmagansiz.');
                return;
            }
            users = await this.prisma.user.findMany({
                where: { branch_id: currentUser.branch_id },
                include: { branch: true },
                orderBy: { full_name: 'asc' },
            });
        }

        if (!users || users.length === 0) {
            await safeEditMessageText(
                ctx,
                '❌ Hech qanday foydalanuvchi mavjud emas.',
                Markup.inlineKeyboard([
                    Markup.button.callback("➕ Foydalanuvchi qo'shish", 'ADD_USER'),
                ]),
            );
            return;
        }

        const userButtons = users.map((u) => {
            const roleEmoji =
            {
                [Role.SUPER_ADMIN]: '👑',
                [Role.ADMIN]: '👨‍💼',
                [Role.CASHIER]: '💰',
            }[u.role] || '👤';

            return Markup.button.callback(`${roleEmoji} ${u.full_name}`, `VIEW_USER_${u.id}`);
        });

        await safeEditMessageText(
            ctx,
            `👥 <b>Foydalanuvchilar ro'yxati (${users.length} ta):</b>`,
            Markup.inlineKeyboard(
                [...userButtons, Markup.button.callback('➕ Yangi', 'ADD_USER')],
                { columns: 2 },
            ),
        );
    }
}
