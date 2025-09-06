import { Scene, SceneEnter, On, Message, Action, Ctx } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';
import { safeEditMessageText, safeReplyOrEdit } from '../../utils/telegram.utils';
import { Role } from '@prisma/client';

@Scene('add-user-scene')
export class AddUserScene {
    constructor(private readonly prisma: PrismaService) { }

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        const telegramId = ctx.from?.id;
        if (!telegramId) {
            await safeReplyOrEdit(ctx, '❌ Telegram ID topilmadi.');
            await ctx.scene.leave();
            return;
        }

        const user = await this.prisma.user.findUnique({
            where: { telegram_id: telegramId },
            include: { branch: true },
        });

        if (!user) {
            await safeReplyOrEdit(ctx, "❌ Siz tizimda ro'yxatdan o'tmagansiz.");
            await ctx.scene.leave();
            return;
        }

        const sceneState = ctx.scene.state as any;

        if (user.role === Role.SUPER_ADMIN) {
            await safeEditMessageText(
                ctx,
                '👤 <b>Yangi foydalanuvchi uchun rolni tanlang:</b>',
                Markup.inlineKeyboard(
                    [
                        Markup.button.callback('👨‍💼 Admin', `ROLE_${Role.ADMIN}`),
                        Markup.button.callback('💰 Kassir', `ROLE_${Role.CASHIER}`),
                        Markup.button.callback('❌ Bekor qilish', 'CANCEL_ADD_USER'),
                        Markup.button.callback('🔙 Orqaga', 'BACK_TO_MAIN_MENU'),
                    ],
                    {
                        columns: 2,
                    },
                ),
            );
        } else if (user.role === Role.ADMIN) {
            sceneState.role = Role.CASHIER;
            await safeReplyOrEdit(
                ctx,
                '💰 <b>Siz yangi Kassir yaratyapsiz.</b>\n\n📱 Yangi foydalanuvchining <b>Telegram ID</b> raqamini kiriting:',
                Markup.inlineKeyboard([
                    Markup.button.callback('❌ Bekor qilish', 'CANCEL_ADD_USER'),
                ]),
            );
        }
    }

    @Action('BACK_TO_MAIN_MENU')
    async onBackToMainMenu(@Ctx() ctx: Context) {
        await ctx.reply('🔙 Asosiy menyuga qaytdingiz.', { parse_mode: 'HTML' });
        await ctx.scene.leave();
    }

    @Action('CANCEL_ADD_USER')
    async onCancelAddUser(@Ctx() ctx: Context) {
        await ctx.reply("❌ Foydalanuvchi qo'shish bekor qilindi.", { parse_mode: 'HTML' });
        await ctx.scene.leave();
    }

    @Action(/ROLE_(.+)/)
    async onRoleSelect(@Ctx() ctx: Context) {
        const roleData = (ctx.callbackQuery as any).data;
        const role = roleData.split('_')[1];
        const sceneState = ctx.scene.state as any;

        sceneState.role = role === Role.ADMIN ? Role.ADMIN : Role.CASHIER;

        const roleText = role === Role.ADMIN ? '👨‍💼 Admin' : '💰 Kassir';

        try {
            await safeEditMessageText(
                ctx,
                `✅ <b>Rol tanlandi:</b> ${roleText}\n\n📱 Yangi foydalanuvchining <b>Telegram ID</b> raqamini kiriting:`,
                Markup.inlineKeyboard([
                    Markup.button.callback('❌ Bekor qilish', 'CANCEL_ADD_USER'),
                ]),
            );
        } catch (error) {
            await ctx.reply(
                `✅ <b>Rol tanlandi:</b> ${roleText}\n\n📱 Yangi foydalanuvchining <b>Telegram ID</b> raqamini kiriting:`,
                {
                    parse_mode: 'HTML', ...Markup.inlineKeyboard([
                        Markup.button.callback('❌ Bekor qilish', 'CANCEL_ADD_USER'),
                    ])
                },
            );
        }
    }

    @Action(/BRANCH_(.+)/)
    async onBranchSelect(@Ctx() ctx: Context) {
        const branchData = (ctx.callbackQuery as any).data;
        const branchId = branchData.split('_')[1];
        const sceneState = ctx.scene.state as any;

        const branch = await this.prisma.branch.findUnique({
            where: { id: branchId },
        });

        if (!branch) {
            try {
                await safeEditMessageText(ctx, '❌ Filial topilmadi.');
            } catch (error) {
                await ctx.reply('❌ Filial topilmadi.', { parse_mode: 'HTML' });
            }
            await ctx.scene.leave();
            return;
        }

        try {
            await this.prisma.user.create({
                data: {
                    telegram_id: sceneState.telegramId,
                    full_name: sceneState.fullName,
                    role: sceneState.role,
                    branch_id: branchId,
                },
            });

            const roleText = sceneState.role === Role.ADMIN ? '👨‍💼 Admin' : '💰 Kassir';

            try {
                await safeEditMessageText(
                    ctx,
                    `✅ ${roleText} "<b>${sceneState.fullName}</b>" muvaffaqiyatli yaratildi!\n\n🏪 <b>Filial:</b> ${branch.name}`,
                );
            } catch (error) {
                await ctx.reply(
                    `✅ ${roleText} "<b>${sceneState.fullName}</b>" muvaffaqiyatli yaratildi!\n\n🏪 <b>Filial:</b> ${branch.name}`,
                    { parse_mode: 'HTML' }
                );
            }
            await ctx.scene.leave();
        } catch (error) {
            try {
                await safeEditMessageText(ctx, '❌ Foydalanuvchi yaratishda xatolik yuz berdi.');
            } catch (error) {
                await ctx.reply('❌ Foydalanuvchi yaratishda xatolik yuz berdi.', { parse_mode: 'HTML' });
            }
            await ctx.scene.leave();
        }
    }

    @On('text')
    async onText(@Ctx() ctx: Context, @Message('text') text: string) {
        const sceneState = ctx.scene.state as any;

        const telegramId = ctx.from?.id;
        if (!telegramId) {
            await ctx.reply('❌ Telegram ID topilmadi.', { parse_mode: 'HTML' });
            await ctx.scene.leave();
            return;
        }

        const user = await this.prisma.user.findUnique({
            where: { telegram_id: telegramId },
            include: { branch: true },
        });

        if (!user) {
            await ctx.reply("❌ Siz tizimda ro'yxatdan o'tmagansiz.", { parse_mode: 'HTML' });
            await ctx.scene.leave();
            return;
        }

        if (!sceneState.role) {
            await ctx.reply('❌ Avval rolni tanlang.', { parse_mode: 'HTML' });
            return;
        }

        if (!sceneState.telegramId) {
            const telegramIdInput = parseInt(text, 10);
            if (isNaN(telegramIdInput)) {
                await ctx.reply("❌ Noto'g'ri Telegram ID. Raqam kiriting.", { parse_mode: 'HTML' });
                return;
            }

            const existingUser = await this.prisma.user.findUnique({
                where: { telegram_id: telegramIdInput },
            });

            if (existingUser) {
                await ctx.reply('❌ Bu Telegram ID allaqachon tizimda mavjud.', { parse_mode: 'HTML' });
                return;
            }

            sceneState.telegramId = telegramIdInput;
            await ctx.reply(
                "✅ <b>Telegram ID saqlandi.</b>\n\n👤 To'liq ismni kiriting:",
                {
                    parse_mode: 'HTML', ...Markup.inlineKeyboard([
                        Markup.button.callback('❌ Bekor qilish', 'CANCEL_ADD_USER'),
                    ])
                },
            );
            return;
        }

        if (!sceneState.fullName) {
            sceneState.fullName = text;

            if (user.role === Role.SUPER_ADMIN) {
                const branches = await this.prisma.branch.findMany();
                if (branches.length === 0) {
                    await ctx.reply('❌ Hech qanday filial topilmadi. Avval filial yarating.', { parse_mode: 'HTML' });
                    await ctx.scene.leave();
                    return;
                }

                const branchButtons = branches.map((branch) =>
                    Markup.button.callback(branch.name, `BRANCH_${branch.id}`),
                );

                await ctx.reply(
                    "✅ <b>To'liq ism saqlandi.</b>\n\n🏪 Foydalanuvchini qaysi filialga tayinlaysiz?",
                    {
                        parse_mode: 'HTML', ...Markup.inlineKeyboard(
                            [
                                ...branchButtons,
                                Markup.button.callback('❌ Bekor qilish', 'CANCEL_ADD_USER'),
                            ],
                            {
                                columns: 2,
                            },
                        )
                    },
                );
                return;
            } else {
                try {
                    await this.prisma.user.create({
                        data: {
                            telegram_id: sceneState.telegramId,
                            full_name: sceneState.fullName,
                            role: sceneState.role,
                            branch_id: user.branch_id,
                        },
                    });
                    await ctx.reply(`✅ Kassir "<b>${sceneState.fullName}</b>" muvaffaqiyatli yaratildi!`, { parse_mode: 'HTML' });
                    await ctx.scene.leave();
                } catch (error) {
                    await ctx.reply('❌ Foydalanuvchi yaratishda xatolik yuz berdi.', { parse_mode: 'HTML' });
                    await ctx.scene.leave();
                }
            }
            return;
        }
    }
}
