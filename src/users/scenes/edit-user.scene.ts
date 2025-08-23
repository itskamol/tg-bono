import { Scene, SceneEnter, On, Message, Action, Ctx } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';
import { Role } from '@prisma/client';

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
    constructor(private readonly prisma: PrismaService) {}

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as EditUserSceneState;

        if (!sceneState.userId) {
            await ctx.reply('❌ Foydalanuvchi ma\'lumotlari topilmadi.');
            await ctx.scene.leave();
            return;
        }

        const user = await this.prisma.user.findUnique({
            where: { id: sceneState.userId },
            include: { branch: true },
        });

        if (!user) {
            await ctx.reply('❌ Foydalanuvchi topilmadi.');
            await ctx.scene.leave();
            return;
        }

        sceneState.userName = user.full_name;
        sceneState.userBranchId = user.branch_id;
        sceneState.userRole = user.role;

        const roleText = {
            [Role.SUPER_ADMIN]: '👑 Super Admin',
            [Role.ADMIN]: '👨‍💼 Admin',
            [Role.CASHIER]: '💰 Kassir',
        }[user.role] || user.role;

        await ctx.reply(
            `✏️ Foydalanuvchi tahrirlash\n\n👤 Joriy ism: ${user.full_name}\n🎭 Rol: ${roleText}\n🏪 Joriy filial: ${user.branch?.name || 'Tayinlanmagan'}\n\nNimani tahrirlashni xohlaysiz?`,
            Markup.inlineKeyboard([
                Markup.button.callback('👤 Ismini o\'zgartirish', 'EDIT_USER_NAME'),
                Markup.button.callback('🏪 Filialini o\'zgartirish', 'EDIT_USER_BRANCH'),
                Markup.button.callback('❌ Bekor qilish', 'CANCEL_EDIT_USER'),
            ], { columns: 1 })
        );
    }

    @Action('EDIT_USER_NAME')
    async onEditUserName(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as EditUserSceneState;
        sceneState.editingName = true;

        await ctx.editMessageText(
            `👤 Yangi ism kiriting:\n\n🔸 Joriy ism: ${sceneState.userName}`,
            Markup.inlineKeyboard([
                Markup.button.callback('🔙 Orqaga', 'BACK_TO_EDIT_MENU'),
                Markup.button.callback('❌ Bekor qilish', 'CANCEL_EDIT_USER'),
            ])
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
            await ctx.editMessageText(
                '❌ Hech qanday filial mavjud emas.',
                Markup.inlineKeyboard([
                    Markup.button.callback('🔙 Orqaga', 'BACK_TO_EDIT_MENU'),
                    Markup.button.callback('❌ Bekor qilish', 'CANCEL_EDIT_USER'),
                ])
            );
            return;
        }

        const branchButtons = branches.map((branch) =>
            Markup.button.callback(
                `🏪 ${branch.name}`,
                `SELECT_BRANCH_${branch.id}`,
            ),
        );

        await ctx.editMessageText(
            `🏪 Yangi filial tanlang:\n\n🔸 Joriy filial: ${sceneState.userBranchId ? 'Mavjud' : 'Tayinlanmagan'}`,
            Markup.inlineKeyboard([
                ...branchButtons,
                Markup.button.callback('🔙 Orqaga', 'BACK_TO_EDIT_MENU'),
                Markup.button.callback('❌ Bekor qilish', 'CANCEL_EDIT_USER'),
            ], { columns: 2 })
        );
    }

    @On('text')
    async onText(@Ctx() ctx: Context, @Message('text') text: string) {
        const sceneState = ctx.scene.state as EditUserSceneState;

        // Ism tahrirlash
        if (sceneState.editingName) {
            const trimmedName = text.trim();
            
            if (trimmedName.length < 2) {
                await ctx.reply('❌ Ism kamida 2 ta belgidan iborat bo\'lishi kerak.');
                return;
            }

            if (trimmedName.length > 50) {
                await ctx.reply('❌ Ism 50 ta belgidan ko\'p bo\'lmasligi kerak.');
                return;
            }

            // Agar ism o'zgarmagan bo'lsa
            if (trimmedName.toLowerCase() === sceneState.userName.toLowerCase()) {
                await ctx.reply('❌ Yangi ism joriy ism bilan bir xil. Boshqa ism kiriting:');
                return;
            }

            sceneState.newName = trimmedName;
            sceneState.editingName = false;

            // Tasdiqlash
            await ctx.reply(
                `📋 Ism o'zgarishi:\n\n🔸 Eski ism: ${sceneState.userName}\n🔹 Yangi ism: ${trimmedName}\n\nTasdiqlaysizmi?`,
                Markup.inlineKeyboard([
                    Markup.button.callback('✅ Ha, o\'zgartirish', 'CONFIRM_NAME_CHANGE'),
                    Markup.button.callback('🔙 Orqaga', 'BACK_TO_EDIT_MENU'),
                    Markup.button.callback('❌ Bekor qilish', 'CANCEL_EDIT_USER'),
                ], { columns: 1 })
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
        
        // Regex orqali branchId'ni olish
        const match = branchData.match(/^SELECT_BRANCH_(.+)$/);
        if (!match) {
            await ctx.editMessageText('❌ Noto\'g\'ri ma\'lumot.');
            return;
        }
        
        const branchId = match[1];
        const sceneState = ctx.scene.state as EditUserSceneState;

        const branch = await this.prisma.branch.findUnique({
            where: { id: branchId },
        });

        if (!branch) {
            await ctx.editMessageText('❌ Filial topilmadi.');
            return;
        }

        // Agar filial o'zgarmagan bo'lsa
        if (branchId === sceneState.userBranchId) {
            await ctx.answerCbQuery('❌ Bu filial allaqachon tanlangan. Boshqa filial tanlang.');
            return;
        }

        sceneState.newBranchId = branchId;
        sceneState.editingBranch = false;

        const currentBranch = sceneState.userBranchId 
            ? await this.prisma.branch.findUnique({ where: { id: sceneState.userBranchId } })
            : null;

        // Tasdiqlash
        await ctx.editMessageText(
            `📋 Filial o'zgarishi:\n\n🔸 Eski filial: ${currentBranch?.name || 'Tayinlanmagan'}\n🔹 Yangi filial: ${branch.name}\n\nTasdiqlaysizmi?`,
            Markup.inlineKeyboard([
                Markup.button.callback('✅ Ha, o\'zgartirish', 'CONFIRM_BRANCH_CHANGE'),
                Markup.button.callback('🔙 Orqaga', 'BACK_TO_EDIT_MENU'),
                Markup.button.callback('❌ Bekor qilish', 'CANCEL_EDIT_USER'),
            ], { columns: 1 })
        );
    }

    @Action('CONFIRM_NAME_CHANGE')
    async onConfirmNameChange(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as EditUserSceneState;

        if (!sceneState.newName) {
            await ctx.editMessageText('❌ Yangi ism topilmadi.');
            await ctx.scene.leave();
            return;
        }

        try {
            await this.prisma.user.update({
                where: { id: sceneState.userId },
                data: { full_name: sceneState.newName },
            });

            await ctx.editMessageText(
                `✅ Foydalanuvchi ismi muvaffaqiyatli o'zgartirildi!\n\n🔸 Eski ism: ${sceneState.userName}\n🔹 Yangi ism: ${sceneState.newName}`
            );
            await ctx.scene.leave();
        } catch (error) {
            console.error('User name update error:', error);
            await ctx.editMessageText('❌ Ism o\'zgartirishda xatolik yuz berdi.');
            await ctx.scene.leave();
        }
    }

    @Action('CONFIRM_BRANCH_CHANGE')
    async onConfirmBranchChange(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as EditUserSceneState;

        if (!sceneState.newBranchId) {
            await ctx.editMessageText('❌ Yangi filial topilmadi.');
            await ctx.scene.leave();
            return;
        }

        try {
            const newBranch = await this.prisma.branch.findUnique({
                where: { id: sceneState.newBranchId },
            });

            if (!newBranch) {
                await ctx.editMessageText('❌ Filial topilmadi.');
                await ctx.scene.leave();
                return;
            }

            await this.prisma.user.update({
                where: { id: sceneState.userId },
                data: { branch_id: sceneState.newBranchId },
            });

            const currentBranch = sceneState.userBranchId 
                ? await this.prisma.branch.findUnique({ where: { id: sceneState.userBranchId } })
                : null;

            await ctx.editMessageText(
                `✅ Foydalanuvchi filiali muvaffaqiyatli o'zgartirildi!\n\n🔸 Eski filial: ${currentBranch?.name || 'Tayinlanmagan'}\n🔹 Yangi filial: ${newBranch.name}`
            );
            await ctx.scene.leave();
        } catch (error) {
            console.error('User branch update error:', error);
            await ctx.editMessageText('❌ Filial o\'zgartirishda xatolik yuz berdi.');
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

        const user = await this.prisma.user.findUnique({
            where: { id: sceneState.userId },
            include: { branch: true },
        });

        if (!user) {
            await ctx.editMessageText('❌ Foydalanuvchi topilmadi.');
            await ctx.scene.leave();
            return;
        }

        const roleText = {
            [Role.SUPER_ADMIN]: '👑 Super Admin',
            [Role.ADMIN]: '👨‍💼 Admin',
            [Role.CASHIER]: '💰 Kassir',
        }[user.role] || user.role;

        await ctx.editMessageText(
            `✏️ Foydalanuvchi tahrirlash\n\n👤 Joriy ism: ${user.full_name}\n🎭 Rol: ${roleText}\n🏪 Joriy filial: ${user.branch?.name || 'Tayinlanmagan'}\n\nNimani tahrirlashni xohlaysiz?`,
            Markup.inlineKeyboard([
                Markup.button.callback('👤 Ismini o\'zgartirish', 'EDIT_USER_NAME'),
                Markup.button.callback('🏪 Filialini o\'zgartirish', 'EDIT_USER_BRANCH'),
                Markup.button.callback('❌ Bekor qilish', 'CANCEL_EDIT_USER'),
            ], { columns: 1 })
        );
    }

    @Action('CANCEL_EDIT_USER')
    async onCancelEditUser(@Ctx() ctx: Context) {
        await ctx.editMessageText('❌ Foydalanuvchi tahrirlash bekor qilindi.');
        await ctx.scene.leave();
    }
}