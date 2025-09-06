import { Scene, SceneEnter, On, Message, Action, Ctx } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';
import { Role } from '@prisma/client';
import { safeEditMessageText } from '../../utils/telegram.utils';

interface EditUserSceneState {
    userId: string;
    userName: string;
    userBranchId?: string;
    userRole: Role;
    newName?: string;
    newBranchId?: string;
    editingName?: boolean;
    editingBranch?: boolean;
}

@Scene('edit-user-scene')
export class EditUserScene {
    constructor(private readonly prisma: PrismaService) { }

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as EditUserSceneState;

        if (!sceneState.userId) {
            await ctx.reply("❌ Foydalanuvchi ma'lumotlari topilmadi.", { parse_mode: 'HTML' });
            await ctx.scene.leave();
            return;
        }

        const user = await this.prisma.user.findUnique({
            where: { id: sceneState.userId },
            include: { branch: true },
        });

        if (!user) {
            await ctx.reply('❌ Foydalanuvchi topilmadi.', { parse_mode: 'HTML' });
            await ctx.scene.leave();
            return;
        }

        sceneState.userName = user.full_name;
        sceneState.userBranchId = user.branch_id;
        sceneState.userRole = user.role;

        const roleText =
        {
            [Role.SUPER_ADMIN]: '👑 Super Admin',
            [Role.ADMIN]: '👨‍💼 Admin',
            [Role.CASHIER]: '💰 Kassir',
        }[user.role] || user.role;

        await safeEditMessageText(
            ctx,
            `✏️ <b>Foydalanuvchi tahrirlash</b>\n\n👤 <b>Joriy ism:</b> ${user.full_name}\n🎭 <b>Rol:</b> ${roleText}\n🏪 <b>Joriy filial:</b> ${user.branch?.name || 'Tayinlanmagan'}\n\nNimani tahrirlashni xohlaysiz?`,
            Markup.inlineKeyboard(
                [
                    Markup.button.callback("👤 Ismini o'zgartirish", 'EDIT_USER_NAME'),
                    Markup.button.callback("🏪 Filialini o'zgartirish", 'EDIT_USER_BRANCH'),
                    Markup.button.callback('❌ Bekor qilish', 'CANCEL_EDIT_USER'),
                ],
                { columns: 1 },
            ),
            'Tahrirlash menyusi',
        );
    }

    @Action('EDIT_USER_NAME')
    async onEditUserName(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as EditUserSceneState;
        sceneState.editingName = true;

        await safeEditMessageText(
            ctx,
            `👤 <b>Yangi ism kiriting:</b>\n\n🔸 <b>Joriy ism:</b> ${sceneState.userName}`,
            Markup.inlineKeyboard([
                Markup.button.callback('🔙 Orqaga', 'BACK_TO_EDIT_MENU'),
                Markup.button.callback('❌ Bekor qilish', 'CANCEL_EDIT_USER'),
            ]),
            'Ism tahrirlash',
        );
    }

    @Action('EDIT_USER_BRANCH')
    async onEditUserBranch(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as EditUserSceneState;
        sceneState.editingBranch = true;

        const branches = await this.prisma.branch.findMany({
            orderBy: { name: 'asc' },
        });

        if (branches.length === 0) {
            await safeEditMessageText(
                ctx,
                '❌ Hech qanday filial mavjud emas.',
                Markup.inlineKeyboard([
                    Markup.button.callback('🔙 Orqaga', 'BACK_TO_EDIT_MENU'),
                    Markup.button.callback('❌ Bekor qilish', 'CANCEL_EDIT_USER'),
                ]),
                'Filial topilmadi',
            );
            return;
        }

        const branchButtons = branches.map((branch) =>
            Markup.button.callback(`🏪 ${branch.name}`, `SELECT_BRANCH_${branch.id}`),
        );

        await safeEditMessageText(
            ctx,
            `🏪 <b>Yangi filial tanlang:</b>\n\n🔸 <b>Joriy filial:</b> ${sceneState.userBranchId ? (await this.prisma.branch.findUnique({ where: { id: sceneState.userBranchId } }))?.name : 'Tayinlanmagan'}`,
            Markup.inlineKeyboard(
                [
                    ...branchButtons,
                    Markup.button.callback('🔙 Orqaga', 'BACK_TO_EDIT_MENU'),
                    Markup.button.callback('❌ Bekor qilish', 'CANCEL_EDIT_USER'),
                ],
                { columns: 2 },
            ),
            'Filial tanlash',
        );
    }

    @On('text')
    async onText(@Ctx() ctx: Context, @Message('text') text: string) {
        const sceneState = ctx.scene.state as EditUserSceneState;

        if (sceneState.editingName) {
            const trimmedName = text.trim();

            if (trimmedName.length < 2) {
                await ctx.reply("❌ Ism kamida 2 ta belgidan iborat bo'lishi kerak.", { parse_mode: 'HTML' });
                return;
            }

            if (trimmedName.length > 50) {
                await ctx.reply("❌ Ism 50 ta belgidan ko'p bo'lmasligi kerak.", { parse_mode: 'HTML' });
                return;
            }

            if (trimmedName.toLowerCase() === sceneState.userName.toLowerCase()) {
                await ctx.reply('❌ Yangi ism joriy ism bilan bir xil. Boshqa ism kiriting:', { parse_mode: 'HTML' });
                return;
            }

            sceneState.newName = trimmedName;
            sceneState.editingName = false;

            await ctx.reply(
                `📋 <b>Ism o'zgarishi:</b>\n\n🔸 <b>Eski ism:</b> ${sceneState.userName}\n🔹 <b>Yangi ism:</b> ${trimmedName}\n\nTasdiqlaysizmi?`,
                {
                    parse_mode: 'HTML', ...Markup.inlineKeyboard(
                        [
                            Markup.button.callback("✅ Ha, o'zgartirish", 'CONFIRM_NAME_CHANGE'),
                            Markup.button.callback('🔙 Orqaga', 'BACK_TO_EDIT_MENU'),
                            Markup.button.callback('❌ Bekor qilish', 'CANCEL_EDIT_USER'),
                        ],
                        { columns: 1 },
                    )
                },
            );
            return;
        }
    }

    @Action(/^SELECT_BRANCH_(.+)$/)
    async onSelectBranch(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) {
            return;
        }
        const branchData = ctx.callbackQuery.data;

        const match = branchData.match(/^SELECT_BRANCH_(.+)$/);
        if (!match) {
            await safeEditMessageText(ctx, "❌ Noto'g'ri ma'lumot.", undefined, 'Xatolik');
            return;
        }

        const branchId = match[1];
        const sceneState = ctx.scene.state as EditUserSceneState;

        const branch = await this.prisma.branch.findUnique({
            where: { id: branchId },
        });

        if (!branch) {
            await safeEditMessageText(ctx, '❌ Filial topilmadi.', undefined, 'Filial topilmadi');
            return;
        }

        if (branchId === sceneState.userBranchId) {
            await ctx.answerCbQuery('❌ Bu filial allaqachon tanlangan. Boshqa filial tanlang.');
            return;
        }

        sceneState.newBranchId = branchId;
        sceneState.editingBranch = false;

        const currentBranch = sceneState.userBranchId
            ? await this.prisma.branch.findUnique({ where: { id: sceneState.userBranchId } })
            : null;

        await safeEditMessageText(
            ctx,
            `📋 <b>Filial o'zgarishi:</b>\n\n🔸 <b>Eski filial:</b> ${currentBranch?.name || 'Tayinlanmagan'}\n🔹 <b>Yangi filial:</b> ${branch.name}\n\nTasdiqlaysizmi?`,
            Markup.inlineKeyboard(
                [
                    Markup.button.callback("✅ Ha, o'zgartirish", 'CONFIRM_BRANCH_CHANGE'),
                    Markup.button.callback('🔙 Orqaga', 'BACK_TO_EDIT_MENU'),
                    Markup.button.callback('❌ Bekor qilish', 'CANCEL_EDIT_USER'),
                ],
                { columns: 1 },
            ),
            "Filial o'zgarishi tasdiqi",
        );
    }

    @Action('CONFIRM_NAME_CHANGE')
    async onConfirmNameChange(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as EditUserSceneState;

        if (!sceneState.newName) {
            await safeEditMessageText(ctx, '❌ Yangi ism topilmadi.', undefined, 'Xatolik');
            await ctx.scene.leave();
            return;
        }

        try {
            await this.prisma.user.update({
                where: { id: sceneState.userId },
                data: { full_name: sceneState.newName },
            });

            await safeEditMessageText(
                ctx,
                `✅ <b>Foydalanuvchi ismi muvaffaqiyatli o'zgartirildi!</b>\n\n🔸 <b>Eski ism:</b> ${sceneState.userName}\n🔹 <b>Yangi ism:</b> ${sceneState.newName}`,
                undefined,
                "Ism o'zgartirildi",
            );
            await ctx.scene.leave();
        } catch (error) {
            await safeEditMessageText(
                ctx,
                "❌ Ism o'zgartirishda xatolik yuz berdi.",
                undefined,
                'Xatolik',
            );
            await ctx.scene.leave();
        }
    }

    @Action('CONFIRM_BRANCH_CHANGE')
    async onConfirmBranchChange(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as EditUserSceneState;

        if (!sceneState.newBranchId) {
            await safeEditMessageText(ctx, '❌ Yangi filial topilmadi.', undefined, 'Xatolik');
            await ctx.scene.leave();
            return;
        }

        try {
            const newBranch = await this.prisma.branch.findUnique({
                where: { id: sceneState.newBranchId },
            });

            if (!newBranch) {
                await safeEditMessageText(
                    ctx,
                    '❌ Filial topilmadi.',
                    undefined,
                    'Filial topilmadi',
                );
                await ctx.scene.leave();
                return;
            }

            const currentBranch = sceneState.userBranchId
                ? await this.prisma.branch.findUnique({ where: { id: sceneState.userBranchId } })
                : null;

            const oldBranchOrdersCount = sceneState.userBranchId
                ? await this.prisma.order.count({
                    where: {
                        cashier_id: sceneState.userId,
                        branch_id: sceneState.userBranchId
                    }
                })
                : 0;

            await this.prisma.user.update({
                where: { id: sceneState.userId },
                data: { branch_id: sceneState.newBranchId },
            });

            let warningMessage = '';
            if (oldBranchOrdersCount > 0) {
                warningMessage = `\n\n⚠️ <b>DIQQAT:</b> Bu foydalanuvchining eski filialdagi <b>${oldBranchOrdersCount}</b> ta buyurtmasi mavjud. Ular yangi filialda ko'rinmaydi, lekin ma'lumotlar bazasida saqlanadi.`;
            }

            await safeEditMessageText(
                ctx,
                `✅ <b>Foydalanuvchi filiali muvaffaqiyatli o'zgartirildi!</b>\n\n🔸 <b>Eski filial:</b> ${currentBranch?.name || 'Tayinlanmagan'}\n🔹 <b>Yangi filial:</b> ${newBranch.name}${warningMessage}`,
                undefined,
                "Filial o'zgartirildi",
            );
            await ctx.scene.leave();
        } catch (error) {
            await safeEditMessageText(
                ctx,
                "❌ Filial o'zgartirishda xatolik yuz berdi.",
                undefined,
                'Xatolik',
            );
            await ctx.scene.leave();
        }
    }

    @Action('BACK_TO_EDIT_MENU')
    async onBackToEditMenu(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as EditUserSceneState;
        sceneState.editingName = false;
        sceneState.editingBranch = false;
        sceneState.newName = undefined;
        sceneState.newBranchId = undefined;

        await this.onSceneEnter(ctx);
    }

    @Action('CANCEL_EDIT_USER')
    async onCancelEditUser(@Ctx() ctx: Context) {
        await safeEditMessageText(
            ctx,
            '❌ Foydalanuvchi tahrirlash bekor qilindi.',
            undefined,
            'Bekor qilindi',
        );
        await ctx.scene.leave();
    }
}
