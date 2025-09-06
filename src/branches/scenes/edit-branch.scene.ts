import { Scene, SceneEnter, On, Message, Action, Ctx } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';
import { safeEditMessageText } from 'src/utils/telegram.utils';

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
    constructor(private readonly prisma: PrismaService) { }

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as EditBranchSceneState;

        if (!sceneState.branchId) {
            await ctx.reply("❌ Filial ma'lumotlari topilmadi.", { parse_mode: 'HTML' });
            await ctx.scene.leave();
            return;
        }

        const branch = await this.prisma.branch.findUnique({
            where: { id: sceneState.branchId },
        });

        if (!branch) {
            await ctx.reply('❌ Filial topilmadi.', { parse_mode: 'HTML' });
            await ctx.scene.leave();
            return;
        }

        sceneState.branchName = branch.name;
        sceneState.branchAddress = branch.address;

        await ctx.reply(
            `✏️ <b>Filial tahrirlash</b>\n\n🏪 <b>Joriy nomi:</b> ${branch.name}\n📍 <b>Joriy manzil:</b> ${branch.address}\n\nNimani tahrirlashni xohlaysiz?`,
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

        await safeEditMessageText(
            ctx,
            `🏪 Yangi nom kiriting:\n\n🔸 <b>Joriy nom:</b> ${sceneState.branchName}`,
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

        await safeEditMessageText(
            ctx,
            `📍 Yangi manzil kiriting:\n\n🔸 <b>Joriy manzil:</b> ${sceneState.branchAddress}`,
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
                await ctx.reply("❌ Filial nomi kamida 2 ta belgidan iborat bo'lishi kerak.", { parse_mode: 'HTML' });
                return;
            }

            if (trimmedName.length > 50) {
                await ctx.reply("❌ Filial nomi 50 ta belgidan ko'p bo'lmasligi kerak.", { parse_mode: 'HTML' });
                return;
            }

            // Agar nom o'zgarmagan bo'lsa
            if (trimmedName.toLowerCase() === sceneState.branchName.toLowerCase()) {
                await ctx.reply('❌ Yangi nom joriy nom bilan bir xil. Boshqa nom kiriting:', { parse_mode: 'HTML' });
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
                await ctx.reply('❌ Bu nom bilan filial allaqachon mavjud. Boshqa nom kiriting:', { parse_mode: 'HTML' });
                return;
            }

            sceneState.newName = trimmedName;
            sceneState.editingName = false;

            // Tasdiqlash
            await ctx.reply(
                `📋 <b>Nom o'zgarishi:</b>\n\n🔸 <b>Eski nom:</b> ${sceneState.branchName}\n🔹 <b>Yangi nom:</b> ${trimmedName}\n\nTasdiqlaysizmi?`,
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
                await ctx.reply("❌ Manzil kamida 5 ta belgidan iborat bo'lishi kerak.", { parse_mode: 'HTML' });
                return;
            }

            if (trimmedAddress.length > 200) {
                await ctx.reply("❌ Manzil 200 ta belgidan ko'p bo'lmasligi kerak.", { parse_mode: 'HTML' });
                return;
            }

            if (trimmedAddress.toLowerCase() === sceneState.branchAddress.toLowerCase()) {
                await ctx.reply(
                    '❌ Yangi manzil joriy manzil bilan bir xil. Boshqa manzil kiriting:',
                    { parse_mode: 'HTML' }
                );
                return;
            }

            sceneState.newAddress = trimmedAddress;
            sceneState.editingAddress = false;

            // Tasdiqlash
            await ctx.reply(
                `📋 <b>Manzil o'zgarishi:</b>\n\n🔸 <b>Eski manzil:</b> ${sceneState.branchAddress}\n🔹 <b>Yangi manzil:</b> ${trimmedAddress}\n\nTasdiqlaysizmi?`,
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
            await safeEditMessageText(ctx, '❌ Yangi nom topilmadi.');
            await ctx.scene.leave();
            return;
        }

        try {
            await this.prisma.branch.update({
                where: { id: sceneState.branchId },
                data: { name: sceneState.newName },
            });

            await safeEditMessageText(
                ctx,
                `✅ <b>Filial nomi muvaffaqiyatli o'zgartirildi!</b>\n\n🔸 <b>Eski nom:</b> ${sceneState.branchName}\n🔹 <b>Yangi nom:</b> ${sceneState.newName}`,
            );
            await ctx.scene.leave();
        } catch (error) {
            await safeEditMessageText(ctx, "❌ Nom o'zgartirishda xatolik yuz berdi.");
            await ctx.scene.leave();
        }
    }

    @Action('CONFIRM_ADDRESS_CHANGE')
    async onConfirmAddressChange(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as EditBranchSceneState;

        if (!sceneState.newAddress) {
            await safeEditMessageText(ctx, '❌ Yangi manzil topilmadi.');
            await ctx.scene.leave();
            return;
        }

        try {
            await this.prisma.branch.update({
                where: { id: sceneState.branchId },
                data: { address: sceneState.newAddress },
            });

            await safeEditMessageText(
                ctx,
                `✅ <b>Filial manzili muvaffaqiyatli o'zgartirildi!</b>\n\n🔸 <b>Eski manzil:</b> ${sceneState.branchAddress}\n🔹 <b>Yangi manzil:</b> ${sceneState.newAddress}`,
            );
            await ctx.scene.leave();
        } catch (error) {
            await safeEditMessageText(ctx, "❌ Manzil o'zgartirishda xatolik yuz berdi.");
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

        await safeEditMessageText(
            ctx,
            `✏️ <b>Filial tahrirlash</b>\n\n🏪 <b>Joriy nomi:</b> ${sceneState.branchName}\n📍 <b>Joriy manzil:</b> ${sceneState.branchAddress}\n\nNimani tahrirlashni xohlaysiz?`,
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
        await safeEditMessageText(ctx, '❌ Filial tahrirlash bekor qilindi.');
        await ctx.scene.leave();
    }
}
