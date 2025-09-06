import { Scene, SceneEnter, On, Message, Action, Ctx } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';
import { safeEditMessageText, safeReplyOrEdit } from 'src/utils/telegram.utils';

interface EditCategorySceneState {
    categoryId: string;
    categoryName: string;
    newName?: string;
    editingName?: boolean;
}

@Scene('edit-category-scene')
export class EditCategoryScene {
    constructor(private readonly prisma: PrismaService) { }

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as EditCategorySceneState;

        if (!sceneState.categoryId) {
            await safeReplyOrEdit(ctx, "❌ Kategoriya ma'lumotlari topilmadi.");
            await ctx.scene.leave();
            return;
        }

        const category = await this.prisma.category.findUnique({
            where: { id: sceneState.categoryId },
        });

        if (!category) {
            await safeReplyOrEdit(ctx, '❌ Kategoriya topilmadi.');
            await ctx.scene.leave();
            return;
        }

        sceneState.categoryName = category.name;
        sceneState.editingName = true;

        await safeReplyOrEdit(
            ctx,
            `✏️ <b>Kategoriya tahrirlash</b>\n\n📝 <b>Joriy nomi:</b> ${category.name}\n\nYangi nom kiriting:`,
            Markup.inlineKeyboard([
                Markup.button.callback('❌ Bekor qilish', 'CANCEL_EDIT_CATEGORY'),
            ]),
        );
    }

    @On('text')
    async onText(@Ctx() ctx: Context, @Message('text') text: string) {
        const sceneState = ctx.scene.state as EditCategorySceneState;

        // Nom tahrirlash
        if (sceneState.editingName) {
            const trimmedName = text.trim();

            if (trimmedName.length < 2) {
                await safeReplyOrEdit(ctx, "❌ Kategoriya nomi kamida 2 ta belgidan iborat bo'lishi kerak.");
                return;
            }

            if (trimmedName.length > 30) {
                await safeReplyOrEdit(ctx, "❌ Kategoriya nomi 30 ta belgidan ko'p bo'lmasligi kerak.");
                return;
            }

            // Agar nom o'zgarmagan bo'lsa
            if (trimmedName.toLowerCase() === sceneState.categoryName.toLowerCase()) {
                await safeReplyOrEdit(ctx, '❌ Yangi nom joriy nom bilan bir xil. Boshqa nom kiriting:');
                return;
            }

            // Kategoriya nomi mavjudligini tekshirish
            const existingCategory = await this.prisma.category.findFirst({
                where: {
                    name: { equals: trimmedName, mode: 'insensitive' },
                    id: { not: sceneState.categoryId },
                },
            });

            if (existingCategory) {
                await safeReplyOrEdit(
                    ctx,
                    '❌ Bu nom bilan kategoriya allaqachon mavjud. Boshqa nom kiriting:',
                );
                return;
            }

            sceneState.newName = trimmedName;
            sceneState.editingName = false;

            // Tasdiqlash
            await safeReplyOrEdit(
                ctx,
                `📋 <b>Nom o'zgarishi:</b>\n\n🔸 <b>Eski nom:</b> ${sceneState.categoryName}\n🔹 <b>Yangi nom:</b> ${trimmedName}\n\nTasdiqlaysizmi?`,
                Markup.inlineKeyboard(
                    [
                        Markup.button.callback("✅ Ha, o'zgartirish", 'CONFIRM_NAME_CHANGE'),
                        Markup.button.callback('❌ Bekor qilish', 'CANCEL_EDIT_CATEGORY'),
                    ],
                    { columns: 1 },
                ),
            );
            return;
        }
    }

    @Action('CONFIRM_NAME_CHANGE')
    async onConfirmNameChange(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as EditCategorySceneState;

        if (!sceneState.newName) {
            await safeEditMessageText(ctx, '❌ Yangi nom topilmadi.');
            await ctx.scene.leave();
            return;
        }

        try {
            await this.prisma.category.update({
                where: { id: sceneState.categoryId },
                data: { name: sceneState.newName },
            });

            await safeEditMessageText(
                ctx,
                `✅ <b>Kategoriya nomi muvaffaqiyatli o'zgartirildi!</b>\n\n🔸 <b>Eski nom:</b> ${sceneState.categoryName}\n🔹 <b>Yangi nom:</b> ${sceneState.newName}`,
            );
            await ctx.scene.leave();
        } catch (error) {
            await safeEditMessageText(ctx, "❌ Nom o'zgartirishda xatolik yuz berdi.");
            await ctx.scene.leave();
        }
    }

    @Action('CANCEL_EDIT_CATEGORY')
    async onCancelEditCategory(@Ctx() ctx: Context) {
        await safeEditMessageText(ctx, '❌ Kategoriya tahrirlash bekor qilindi.');
        await ctx.scene.leave();
    }
}
