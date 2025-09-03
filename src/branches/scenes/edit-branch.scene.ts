import { Scene, SceneEnter, On, Message, Action, Ctx } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';

interface EditBranchSceneState {
    branchId: string;
    branchName: string;
    branchAddress: string;
    newName?: string;
    newAddress?: string;
    editingName?: boolean;
    editingAddress?: boolean;
}

@Scene('edit-branch-scene')
export class EditBranchScene {
    constructor(private readonly prisma: PrismaService) {}

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as EditBranchSceneState;

        if (!sceneState.branchId) {
            await ctx.reply("❌ Filial ma'lumotlari topilmadi.");
            await ctx.scene.leave();
            return;
        }

        const branch = await this.prisma.branch.findUnique({
            where: { id: sceneState.branchId },
        });

        if (!branch) {
            await ctx.reply('❌ Filial topilmadi.');
            await ctx.scene.leave();
            return;
        }

        sceneState.branchName = branch.name;
        sceneState.branchAddress = branch.address;

        await ctx.reply(
            `✏️ Filial tahrirlash\n\n🏪 Joriy nomi: ${branch.name}\n📍 Joriy manzil: ${branch.address}\n\nNimani tahrirlashni xohlaysiz?`,
            Markup.inlineKeyboard(
                [
                    Markup.button.callback("🏪 Nomini o'zgartirish", 'EDIT_BRANCH_NAME'),
                    Markup.button.callback("📍 Manzilni o'zgartirish", 'EDIT_BRANCH_ADDRESS'),
                    Markup.button.callback('❌ Bekor qilish', 'CANCEL_EDIT_BRANCH'),
                ],
                { columns: 1 },
            ),
        );
    }

    @Action('EDIT_BRANCH_NAME')
    async onEditBranchName(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as EditBranchSceneState;
        sceneState.editingName = true;

        await ctx.editMessageText(
            `🏪 Yangi nom kiriting:\n\n🔸 Joriy nom: ${sceneState.branchName}`,
            Markup.inlineKeyboard([
                Markup.button.callback('🔙 Orqaga', 'BACK_TO_EDIT_MENU'),
                Markup.button.callback('❌ Bekor qilish', 'CANCEL_EDIT_BRANCH'),
            ]),
        );
    }

    @Action('EDIT_BRANCH_ADDRESS')
    async onEditBranchAddress(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as EditBranchSceneState;
        sceneState.editingAddress = true;

        await ctx.editMessageText(
            `📍 Yangi manzil kiriting:\n\n🔸 Joriy manzil: ${sceneState.branchAddress}`,
            Markup.inlineKeyboard([
                Markup.button.callback('🔙 Orqaga', 'BACK_TO_EDIT_MENU'),
                Markup.button.callback('❌ Bekor qilish', 'CANCEL_EDIT_BRANCH'),
            ]),
        );
    }

    @On('text')
    async onText(@Ctx() ctx: Context, @Message('text') text: string) {
        const sceneState = ctx.scene.state as EditBranchSceneState;

        // Nom tahrirlash
        if (sceneState.editingName) {
            const trimmedName = text.trim();

            if (trimmedName.length < 2) {
                await ctx.reply("❌ Filial nomi kamida 2 ta belgidan iborat bo'lishi kerak.");
                return;
            }

            if (trimmedName.length > 50) {
                await ctx.reply("❌ Filial nomi 50 ta belgidan ko'p bo'lmasligi kerak.");
                return;
            }

            // Agar nom o'zgarmagan bo'lsa
            if (trimmedName.toLowerCase() === sceneState.branchName.toLowerCase()) {
                await ctx.reply('❌ Yangi nom joriy nom bilan bir xil. Boshqa nom kiriting:');
                return;
            }

            // Filial nomi mavjudligini tekshirish
            const existingBranch = await this.prisma.branch.findFirst({
                where: {
                    name: { equals: trimmedName, mode: 'insensitive' },
                    id: { not: sceneState.branchId },
                },
            });

            if (existingBranch) {
                await ctx.reply('❌ Bu nom bilan filial allaqachon mavjud. Boshqa nom kiriting:');
                return;
            }

            sceneState.newName = trimmedName;
            sceneState.editingName = false;

            // Tasdiqlash
            await ctx.reply(
                `📋 Nom o'zgarishi:\n\n🔸 Eski nom: ${sceneState.branchName}\n🔹 Yangi nom: ${trimmedName}\n\nTasdiqlaysizmi?`,
                Markup.inlineKeyboard(
                    [
                        Markup.button.callback("✅ Ha, o'zgartirish", 'CONFIRM_NAME_CHANGE'),
                        Markup.button.callback('🔙 Orqaga', 'BACK_TO_EDIT_MENU'),
                        Markup.button.callback('❌ Bekor qilish', 'CANCEL_EDIT_BRANCH'),
                    ],
                    { columns: 1 },
                ),
            );
            return;
        }

        // Manzil tahrirlash
        if (sceneState.editingAddress) {
            const trimmedAddress = text.trim();

            if (trimmedAddress.length < 5) {
                await ctx.reply("❌ Manzil kamida 5 ta belgidan iborat bo'lishi kerak.");
                return;
            }

            if (trimmedAddress.length > 200) {
                await ctx.reply("❌ Manzil 200 ta belgidan ko'p bo'lmasligi kerak.");
                return;
            }

            if (trimmedAddress.toLowerCase() === sceneState.branchAddress.toLowerCase()) {
                await ctx.reply(
                    '❌ Yangi manzil joriy manzil bilan bir xil. Boshqa manzil kiriting:',
                );
                return;
            }

            sceneState.newAddress = trimmedAddress;
            sceneState.editingAddress = false;

            // Tasdiqlash
            await ctx.reply(
                `📋 Manzil o'zgarishi:\n\n🔸 Eski manzil: ${sceneState.branchAddress}\n🔹 Yangi manzil: ${trimmedAddress}\n\nTasdiqlaysizmi?`,
                Markup.inlineKeyboard(
                    [
                        Markup.button.callback("✅ Ha, o'zgartirish", 'CONFIRM_ADDRESS_CHANGE'),
                        Markup.button.callback('🔙 Orqaga', 'BACK_TO_EDIT_MENU'),
                        Markup.button.callback('❌ Bekor qilish', 'CANCEL_EDIT_BRANCH'),
                    ],
                    { columns: 1 },
                ),
            );
            return;
        }
    }

    @Action('CONFIRM_NAME_CHANGE')
    async onConfirmNameChange(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as EditBranchSceneState;

        if (!sceneState.newName) {
            await ctx.editMessageText('❌ Yangi nom topilmadi.');
            await ctx.scene.leave();
            return;
        }

        try {
            await this.prisma.branch.update({
                where: { id: sceneState.branchId },
                data: { name: sceneState.newName },
            });

            await ctx.editMessageText(
                `✅ Filial nomi muvaffaqiyatli o'zgartirildi!\n\n🔸 Eski nom: ${sceneState.branchName}\n🔹 Yangi nom: ${sceneState.newName}`,
            );
            await ctx.scene.leave();
        } catch (error) {
            await ctx.editMessageText("❌ Nom o'zgartirishda xatolik yuz berdi.");
            await ctx.scene.leave();
        }
    }

    @Action('CONFIRM_ADDRESS_CHANGE')
    async onConfirmAddressChange(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as EditBranchSceneState;

        if (!sceneState.newAddress) {
            await ctx.editMessageText('❌ Yangi manzil topilmadi.');
            await ctx.scene.leave();
            return;
        }

        try {
            await this.prisma.branch.update({
                where: { id: sceneState.branchId },
                data: { address: sceneState.newAddress },
            });

            await ctx.editMessageText(
                `✅ Filial manzili muvaffaqiyatli o'zgartirildi!\n\n🔸 Eski manzil: ${sceneState.branchAddress}\n🔹 Yangi manzil: ${sceneState.newAddress}`,
            );
            await ctx.scene.leave();
        } catch (error) {
            await ctx.editMessageText("❌ Manzil o'zgartirishda xatolik yuz berdi.");
            await ctx.scene.leave();
        }
    }

    @Action('BACK_TO_EDIT_MENU')
    async onBackToEditMenu(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as EditBranchSceneState;
        sceneState.editingName = false;
        sceneState.editingAddress = false;
        sceneState.newName = undefined;
        sceneState.newAddress = undefined;

        await ctx.editMessageText(
            `✏️ Filial tahrirlash\n\n🏪 Joriy nomi: ${sceneState.branchName}\n📍 Joriy manzil: ${sceneState.branchAddress}\n\nNimani tahrirlashni xohlaysiz?`,
            Markup.inlineKeyboard(
                [
                    Markup.button.callback("🏪 Nomini o'zgartirish", 'EDIT_BRANCH_NAME'),
                    Markup.button.callback("📍 Manzilni o'zgartirish", 'EDIT_BRANCH_ADDRESS'),
                    Markup.button.callback('❌ Bekor qilish', 'CANCEL_EDIT_BRANCH'),
                ],
                { columns: 1 },
            ),
        );
    }

    @Action('CANCEL_EDIT_BRANCH')
    async onCancelEditBranch(@Ctx() ctx: Context) {
        await ctx.editMessageText('❌ Filial tahrirlash bekor qilindi.');
        await ctx.scene.leave();
    }
}
