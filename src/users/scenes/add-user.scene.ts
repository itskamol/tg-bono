import { Scene, SceneEnter, On, Message, Action, Ctx } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';
import { Role } from '@prisma/client';

interface AddUserSceneState {
    role?: Role;
    telegramId?: number;
    fullName?: string;
}

@Scene('add-user-scene')
export class AddUserScene {
    constructor(private readonly prisma: PrismaService) {}

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        const telegramId = ctx.from?.id;
        if (!telegramId) {
            await ctx.reply('❌ Telegram ID topilmadi.');
            await ctx.scene.leave();
            return;
        }

        const user = await this.prisma.user.findUnique({
            where: { telegram_id: telegramId },
            include: { branch: true },
        });

        if (!user) {
            await ctx.reply("❌ Siz tizimda ro'yxatdan o'tmagansiz.");
            await ctx.scene.leave();
            return;
        }

        const sceneState = ctx.scene.state as AddUserSceneState;
        sceneState.role = undefined;
        sceneState.telegramId = undefined;
        sceneState.fullName = undefined;

        if (user.role === Role.SUPER_ADMIN) {
            // Super Admin can choose role with inline keyboard
            await ctx.reply(
                '👤 Yangi foydalanuvchi uchun rolni tanlang:',
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
            // Admin can only create Kassir
            sceneState.role = Role.CASHIER;
            await ctx.reply(
                '💰 Siz yangi Kassir yaratyapsiz.\n\n📱 Yangi foydalanuvchining Telegram ID raqamini kiriting:',
                Markup.inlineKeyboard([
                    Markup.button.callback('❌ Bekor qilish', 'CANCEL_ADD_USER'),
                ]),
            );
        }
    }

    @Action('BACK_TO_MAIN_MENU')
    async onBackToMainMenu(@Ctx() ctx: Context) {
        await ctx.reply('🔙 Asosiy menyuga qaytdingiz.');
        await ctx.scene.leave();
    }

    @Action('CANCEL_ADD_USER')
    async onCancelAddUser(@Ctx() ctx: Context) {
        await ctx.reply("❌ Foydalanuvchi qo'shish bekor qilindi.");
        await ctx.scene.leave();
    }

    @Action(/ROLE_(.+)/)
    async onRoleSelect(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) return;
        const role = ctx.callbackQuery.data.split('_')[1] as Role;
        const sceneState = ctx.scene.state as AddUserSceneState;

        sceneState.role = role === Role.ADMIN ? Role.ADMIN : Role.CASHIER;

        const roleText = role === Role.ADMIN ? '👨‍💼 Admin' : '💰 Kassir';

        await ctx.editMessageText(
            `✅ Rol tanlandi: ${roleText}\n\n📱 Yangi foydalanuvchining Telegram ID raqamini kiriting:`,
            Markup.inlineKeyboard([Markup.button.callback('❌ Bekor qilish', 'CANCEL_ADD_USER')]),
        );
    }

    @Action(/BRANCH_(.+)/)
    async onBranchSelect(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) return;
        const branchId = ctx.callbackQuery.data.split('_')[1];
        const sceneState = ctx.scene.state as AddUserSceneState;

        const branch = await this.prisma.branch.findUnique({
            where: { id: branchId },
        });

        if (!branch) {
            await ctx.editMessageText('❌ Filial topilmadi.');
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

            await ctx.editMessageText(
                `✅ ${roleText} "${sceneState.fullName}" muvaffaqiyatli yaratildi!\n\n🏪 Filial: ${branch.name}`,
            );
            await ctx.scene.leave();
        } catch {
            await ctx.editMessageText('❌ Foydalanuvchi yaratishda xatolik yuz berdi.');
            await ctx.scene.leave();
        }
    }

    @On('text')
    async onText(@Ctx() ctx: Context, @Message('text') text: string) {
        const sceneState = ctx.scene.state as AddUserSceneState;

        // Get user from database since ctx.user might not be available in scenes
        const telegramId = ctx.from?.id;
        if (!telegramId) {
            await ctx.reply('❌ Telegram ID topilmadi.');
            await ctx.scene.leave();
            return;
        }

        const user = await this.prisma.user.findUnique({
            where: { telegram_id: telegramId },
            include: { branch: true },
        });

        if (!user) {
            await ctx.reply("❌ Siz tizimda ro'yxatdan o'tmagansiz.");
            await ctx.scene.leave();
            return;
        }

        // Role should be set via inline keyboard, skip text-based role selection
        if (!sceneState.role) {
            await ctx.reply('❌ Avval rolni tanlang.');
            return;
        }

        // Step 1: Set Telegram ID
        if (!sceneState.telegramId) {
            const telegramIdInput = parseInt(text, 10);
            if (isNaN(telegramIdInput)) {
                await ctx.reply("❌ Noto'g'ri Telegram ID. Raqam kiriting.");
                return;
            }

            // Check if user already exists
            const existingUser = await this.prisma.user.findUnique({
                where: { telegram_id: telegramIdInput },
            });

            if (existingUser) {
                await ctx.reply('❌ Bu Telegram ID allaqachon tizimda mavjud.');
                return;
            }

            sceneState.telegramId = telegramIdInput;
            await ctx.reply(
                "✅ Telegram ID saqlandi.\n\n👤 To'liq ismni kiriting:",
                Markup.inlineKeyboard([
                    Markup.button.callback('❌ Bekor qilish', 'CANCEL_ADD_USER'),
                ]),
            );
            return;
        }

        // Step 2: Set Full Name and complete user creation
        if (!sceneState.fullName) {
            sceneState.fullName = text;

            if (user.role === Role.SUPER_ADMIN) {
                // Show branch selection for Super Admin
                const branches = await this.prisma.branch.findMany();
                if (branches.length === 0) {
                    await ctx.reply('❌ Hech qanday filial topilmadi. Avval filial yarating.');
                    await ctx.scene.leave();
                    return;
                }

                const branchButtons = branches.map((branch) =>
                    Markup.button.callback(branch.name, `BRANCH_${branch.id}`),
                );

                await ctx.reply(
                    "✅ To'liq ism saqlandi.\n\n🏪 Foydalanuvchini qaysi filialga tayinlaysiz?",
                    Markup.inlineKeyboard(
                        [
                            ...branchButtons,
                            Markup.button.callback('❌ Bekor qilish', 'CANCEL_ADD_USER'),
                        ],
                        {
                            columns: 2,
                        },
                    ),
                );
                return;
            } else {
                // Admin creating a Kassir
                try {
                    if (!user.branch_id) {
                        await ctx.reply('❌ Siz filialga biriktirilmagansiz.');
                        await ctx.scene.leave();
                        return;
                    }
                    await this.prisma.user.create({
                        data: {
                            telegram_id: sceneState.telegramId,
                            full_name: sceneState.fullName,
                            role: sceneState.role,
                            branch_id: user.branch_id,
                        },
                    });
                    await ctx.reply(`✅ Kassir "${sceneState.fullName}" muvaffaqiyatli yaratildi!`);
                    await ctx.scene.leave();
                } catch {
                    await ctx.reply('❌ Foydalanuvchi yaratishda xatolik yuz berdi.');
                    await ctx.scene.leave();
                }
            }
            return;
        }
    }
}
