import { Scene, SceneEnter, On, Message, Action, Ctx } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';

interface EditCategorySceneState {
    categoryId: string;
    categoryName: string;
    categoryEmoji: string;
    newName?: string;
    newEmoji?: string;
    editingName?: boolean;
    editingEmoji?: boolean;
}

@Scene('edit-category-scene')
export class EditCategoryScene {
    constructor(private readonly prisma: PrismaService) { }

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as EditCategorySceneState;

        if (!sceneState.categoryId) {
            await ctx.reply('❌ Kategoriya ma\'lumotlari topilmadi.');
            await ctx.scene.leave();
            return;
        }

        const category = await this.prisma.category.findUnique({
            where: { id: sceneState.categoryId },
        });

        if (!category) {
            await ctx.reply('❌ Kategoriya topilmadi.');
            await ctx.scene.leave();
            return;
        }

        sceneState.categoryName = category.name;
        sceneState.categoryEmoji = category.emoji;

        await ctx.reply(
            `✏️ Kategoriya tahrirlash\n\n📝 Joriy nomi: ${category.name}\n😊 Joriy emoji: ${category.emoji}\n\nNimani tahrirlashni xohlaysiz?`,
            Markup.inlineKeyboard([
                Markup.button.callback('📝 Nomini o\'zgartirish', 'EDIT_CATEGORY_NAME'),
                Markup.button.callback('😊 Emoji o\'zgartirish', 'EDIT_CATEGORY_EMOJI'),
                Markup.button.callback('❌ Bekor qilish', 'CANCEL_EDIT_CATEGORY'),
            ], { columns: 1 })
        );
    }

    @Action('EDIT_CATEGORY_NAME')
    async onEditCategoryName(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as EditCategorySceneState;
        sceneState.editingName = true;

        await ctx.editMessageText(
            `📝 Yangi nom kiriting:\n\n🔸 Joriy nom: ${sceneState.categoryName}`,
            Markup.inlineKeyboard([
                Markup.button.callback('🔙 Orqaga', 'BACK_TO_EDIT_MENU'),
                Markup.button.callback('❌ Bekor qilish', 'CANCEL_EDIT_CATEGORY'),
            ])
        );
    }

    @Action('EDIT_CATEGORY_EMOJI')
    async onEditCategoryEmoji(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as EditCategorySceneState;
        sceneState.editingEmoji = true;

        await ctx.editMessageText(
            `😊 Yangi emoji tanlang yoki kiriting:\n\n🔸 Joriy emoji: ${sceneState.categoryEmoji}`,
            Markup.inlineKeyboard([
                Markup.button.callback('🍕', 'SELECT_NEW_EMOJI_🍕'),
                Markup.button.callback('🍔', 'SELECT_NEW_EMOJI_🍔'),
                Markup.button.callback('🥤', 'SELECT_NEW_EMOJI_🥤'),
                Markup.button.callback('🍰', 'SELECT_NEW_EMOJI_🍰'),
                Markup.button.callback('🥗', 'SELECT_NEW_EMOJI_🥗'),
                Markup.button.callback('🍜', 'SELECT_NEW_EMOJI_🍜'),
                Markup.button.callback('🌮', 'SELECT_NEW_EMOJI_🌮'),
                Markup.button.callback('🍣', 'SELECT_NEW_EMOJI_🍣'),
                Markup.button.callback('📦', 'SELECT_NEW_EMOJI_📦'),
                Markup.button.callback('🔙 Orqaga', 'BACK_TO_EDIT_MENU'),
                Markup.button.callback('❌ Bekor qilish', 'CANCEL_EDIT_CATEGORY'),
            ], { columns: 3 })
        );
    }

    @On('text')
    async onText(@Ctx() ctx: Context, @Message('text') text: string) {
        const sceneState = ctx.scene.state as EditCategorySceneState;

        // Nom tahrirlash
        if (sceneState.editingName) {
            const trimmedName = text.trim();

            if (trimmedName.length < 2) {
                await ctx.reply('❌ Kategoriya nomi kamida 2 ta belgidan iborat bo\'lishi kerak.');
                return;
            }

            if (trimmedName.length > 30) {
                await ctx.reply('❌ Kategoriya nomi 30 ta belgidan ko\'p bo\'lmasligi kerak.');
                return;
            }

            // Agar nom o'zgarmagan bo'lsa
            if (trimmedName.toLowerCase() === sceneState.categoryName.toLowerCase()) {
                await ctx.reply('❌ Yangi nom joriy nom bilan bir xil. Boshqa nom kiriting:');
                return;
            }

            // Kategoriya nomi mavjudligini tekshirish
            const existingCategory = await this.prisma.category.findFirst({
                where: {
                    name: { equals: trimmedName, mode: 'insensitive' },
                    id: { not: sceneState.categoryId }
                },
            });

            if (existingCategory) {
                await ctx.reply('❌ Bu nom bilan kategoriya allaqachon mavjud. Boshqa nom kiriting:');
                return;
            }

            sceneState.newName = trimmedName;
            sceneState.editingName = false;

            // Tasdiqlash
            await ctx.reply(
                `📋 Nom o'zgarishi:\n\n🔸 Eski nom: ${sceneState.categoryName}\n🔹 Yangi nom: ${trimmedName}\n\nTasdiqlaysizmi?`,
                Markup.inlineKeyboard([
                    Markup.button.callback('✅ Ha, o\'zgartirish', 'CONFIRM_NAME_CHANGE'),
                    Markup.button.callback('🔙 Orqaga', 'BACK_TO_EDIT_MENU'),
                    Markup.button.callback('❌ Bekor qilish', 'CANCEL_EDIT_CATEGORY'),
                ], { columns: 1 })
            );
            return;
        }

        // Emoji tahrirlash (agar matn orqali kiritilsa)
        if (sceneState.editingEmoji) {
            const emoji = text.trim();

            if (emoji.length === 0) {
                await ctx.reply('❌ Emoji kiriting yoki yuqoridagi tugmalardan birini tanlang.');
                return;
            }

            if (emoji.length > 10) {
                await ctx.reply('❌ Emoji juda uzun. Bitta emoji kiriting.');
                return;
            }

            if (emoji === sceneState.categoryEmoji) {
                await ctx.reply('❌ Yangi emoji joriy emoji bilan bir xil. Boshqa emoji kiriting:');
                return;
            }

            await this.processEmojiChange(ctx, emoji);
            return;
        }
    }

    @Action(/^SELECT_NEW_EMOJI_(.+)$/)
    async onSelectNewEmoji(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) {
            return;
        }
        const emoji = ctx.callbackQuery.data.replace('SELECT_NEW_EMOJI_', '');

        const sceneState = ctx.scene.state as EditCategorySceneState;
        if (emoji === sceneState.categoryEmoji) {
            await ctx.answerCbQuery('❌ Bu emoji allaqachon tanlangan. Boshqa emoji tanlang.');
            return;
        }

        await this.processEmojiChange(ctx, emoji);
    }

    private async processEmojiChange(ctx: Context, emoji: string) {
        const sceneState = ctx.scene.state as EditCategorySceneState;
        sceneState.newEmoji = emoji;
        sceneState.editingEmoji = false;

        // Tasdiqlash
        await ctx.reply(
            `📋 Emoji o'zgarishi:\n\n🔸 Eski emoji: ${sceneState.categoryEmoji}\n🔹 Yangi emoji: ${emoji}\n\nTasdiqlaysizmi?`,
            Markup.inlineKeyboard([
                Markup.button.callback('✅ Ha, o\'zgartirish', 'CONFIRM_EMOJI_CHANGE'),
                Markup.button.callback('🔙 Orqaga', 'BACK_TO_EDIT_MENU'),
                Markup.button.callback('❌ Bekor qilish', 'CANCEL_EDIT_CATEGORY'),
            ], { columns: 1 })
        );
    }

    @Action('CONFIRM_NAME_CHANGE')
    async onConfirmNameChange(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as EditCategorySceneState;

        if (!sceneState.newName) {
            await ctx.editMessageText('❌ Yangi nom topilmadi.');
            await ctx.scene.leave();
            return;
        }

        try {
            await this.prisma.category.update({
                where: { id: sceneState.categoryId },
                data: { name: sceneState.newName },
            });

            await ctx.editMessageText(
                `✅ Kategoriya nomi muvaffaqiyatli o'zgartirildi!\n\n🔸 Eski nom: ${sceneState.categoryName}\n🔹 Yangi nom: ${sceneState.newName}`
            );
            await ctx.scene.leave();
        } catch (error) {
            console.error('Category name update error:', error);
            await ctx.editMessageText('❌ Nom o\'zgartirishda xatolik yuz berdi.');
            await ctx.scene.leave();
        }
    }

    @Action('CONFIRM_EMOJI_CHANGE')
    async onConfirmEmojiChange(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as EditCategorySceneState;

        if (!sceneState.newEmoji) {
            await ctx.editMessageText('❌ Yangi emoji topilmadi.');
            await ctx.scene.leave();
            return;
        }

        try {
            await this.prisma.category.update({
                where: { id: sceneState.categoryId },
                data: { emoji: sceneState.newEmoji },
            });

            await ctx.editMessageText(
                `✅ Kategoriya emoji muvaffaqiyatli o'zgartirildi!\n\n🔸 Eski emoji: ${sceneState.categoryEmoji}\n🔹 Yangi emoji: ${sceneState.newEmoji}`
            );
            await ctx.scene.leave();
        } catch (error) {
            console.error('Category emoji update error:', error);
            await ctx.editMessageText('❌ Emoji o\'zgartirishda xatolik yuz berdi.');
            await ctx.scene.leave();
        }
    }

    @Action('BACK_TO_EDIT_MENU')
    async onBackToEditMenu(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as EditCategorySceneState;
        sceneState.editingName = false;
        sceneState.editingEmoji = false;
        sceneState.newName = undefined;
        sceneState.newEmoji = undefined;

        await ctx.editMessageText(
            `✏️ Kategoriya tahrirlash\n\n📝 Joriy nomi: ${sceneState.categoryName}\n😊 Joriy emoji: ${sceneState.categoryEmoji}\n\nNimani tahrirlashni xohlaysiz?`,
            Markup.inlineKeyboard([
                Markup.button.callback('📝 Nomini o\'zgartirish', 'EDIT_CATEGORY_NAME'),
                Markup.button.callback('😊 Emoji o\'zgartirish', 'EDIT_CATEGORY_EMOJI'),
                Markup.button.callback('❌ Bekor qilish', 'CANCEL_EDIT_CATEGORY'),
            ], { columns: 1 })
        );
    }

    @Action('CANCEL_EDIT_CATEGORY')
    async onCancelEditCategory(@Ctx() ctx: Context) {
        await ctx.editMessageText('❌ Kategoriya tahrirlash bekor qilindi.');
        await ctx.scene.leave();
    }
}