import { Scene, SceneEnter, On, Message, Action, Ctx } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';

interface AddCategorySceneState {
    name?: string;
    emoji?: string;
    awaitingName?: boolean;
    awaitingEmoji?: boolean;
}

@Scene('add-category-scene')
export class AddCategoryScene {
    constructor(private readonly prisma: PrismaService) {}

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as AddCategorySceneState;
        sceneState.awaitingName = true;

        await ctx.reply(
            '📦 Yangi kategoriya qo\'shish\n\n📝 Kategoriya nomini kiriting:',
            Markup.inlineKeyboard([
                Markup.button.callback('❌ Bekor qilish', 'CANCEL_ADD_CATEGORY'),
            ]),
        );
    }

    @On('text')
    async onText(@Ctx() ctx: Context, @Message('text') text: string) {
        const sceneState = ctx.scene.state as AddCategorySceneState;

        // Step 1: Kategoriya nomi
        if (sceneState.awaitingName) {
            const trimmedName = text.trim();
            
            if (trimmedName.length < 2) {
                await ctx.reply('❌ Kategoriya nomi kamida 2 ta belgidan iborat bo\'lishi kerak.');
                return;
            }

            if (trimmedName.length > 30) {
                await ctx.reply('❌ Kategoriya nomi 30 ta belgidan ko\'p bo\'lmasligi kerak.');
                return;
            }

            // Kategoriya nomi mavjudligini tekshirish
            const existingCategory = await this.prisma.category.findFirst({
                where: { name: { equals: trimmedName, mode: 'insensitive' } },
            });

            if (existingCategory) {
                await ctx.reply('❌ Bu nom bilan kategoriya allaqachon mavjud. Boshqa nom kiriting:');
                return;
            }

            sceneState.name = trimmedName;
            sceneState.awaitingName = false;
            sceneState.awaitingEmoji = true;

            // Mashhur emoji'larni taklif qilish
            await ctx.reply(
                `✅ Kategoriya nomi: ${trimmedName}\n\n😊 Kategoriya uchun emoji tanlang yoki kiriting:`,
                Markup.inlineKeyboard([
                    Markup.button.callback('🍕', 'SELECT_EMOJI_🍕'),
                    Markup.button.callback('🍔', 'SELECT_EMOJI_🍔'),
                    Markup.button.callback('🥤', 'SELECT_EMOJI_🥤'),
                    Markup.button.callback('🍰', 'SELECT_EMOJI_🍰'),
                    Markup.button.callback('🥗', 'SELECT_EMOJI_🥗'),
                    Markup.button.callback('🍜', 'SELECT_EMOJI_🍜'),
                    Markup.button.callback('🌮', 'SELECT_EMOJI_🌮'),
                    Markup.button.callback('🍣', 'SELECT_EMOJI_🍣'),
                    Markup.button.callback('📦', 'SELECT_EMOJI_📦'),
                    Markup.button.callback('🔙 Orqaga', 'BACK_TO_NAME'),
                    Markup.button.callback('❌ Bekor qilish', 'CANCEL_ADD_CATEGORY'),
                ], { columns: 3 })
            );
            return;
        }

        // Step 2: Emoji (agar matn orqali kiritilsa)
        if (sceneState.awaitingEmoji) {
            const emoji = text.trim();
            
            // Emoji validatsiyasi
            if (emoji.length === 0) {
                await ctx.reply('❌ Emoji kiriting yoki yuqoridagi tugmalardan birini tanlang.');
                return;
            }

            if (emoji.length > 10) {
                await ctx.reply('❌ Emoji juda uzun. Bitta emoji kiriting.');
                return;
            }

            await this.processEmojiSelection(ctx, emoji);
            return;
        }
    }

    @Action(/^SELECT_EMOJI_(.+)$/)
    async onSelectEmoji(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) {
            return;
        }
        const emoji = ctx.callbackQuery.data.replace('SELECT_EMOJI_', '');
        await this.processEmojiSelection(ctx, emoji);
    }

    private async processEmojiSelection(ctx: Context, emoji: string) {
        const sceneState = ctx.scene.state as AddCategorySceneState;
        sceneState.emoji = emoji;
        sceneState.awaitingEmoji = false;

        // Tasdiqlash
        await ctx.reply(
            `📋 Yangi kategoriya ma'lumotlari:\n\n📝 Nomi: ${sceneState.name}\n😊 Emoji: ${emoji}\n\nTasdiqlaysizmi?`,
            Markup.inlineKeyboard([
                Markup.button.callback('✅ Ha, qo\'shish', 'CONFIRM_ADD_CATEGORY'),
                Markup.button.callback('🔙 Emoji o\'zgartirish', 'BACK_TO_EMOJI'),
                Markup.button.callback('❌ Bekor qilish', 'CANCEL_ADD_CATEGORY'),
            ], { columns: 1 })
        );
    }

    @Action('BACK_TO_NAME')
    async onBackToName(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as AddCategorySceneState;
        sceneState.awaitingName = true;
        sceneState.awaitingEmoji = false;
        sceneState.name = undefined;

        await ctx.editMessageText(
            '📦 Yangi kategoriya qo\'shish\n\n📝 Kategoriya nomini kiriting:',
            Markup.inlineKeyboard([
                Markup.button.callback('❌ Bekor qilish', 'CANCEL_ADD_CATEGORY'),
            ])
        );
    }

    @Action('BACK_TO_EMOJI')
    async onBackToEmoji(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as AddCategorySceneState;
        sceneState.awaitingEmoji = true;
        sceneState.emoji = undefined;

        await ctx.editMessageText(
            `✅ Kategoriya nomi: ${sceneState.name}\n\n😊 Kategoriya uchun emoji tanlang yoki kiriting:`,
            Markup.inlineKeyboard([
                Markup.button.callback('🍕', 'SELECT_EMOJI_🍕'),
                Markup.button.callback('🍔', 'SELECT_EMOJI_🍔'),
                Markup.button.callback('🥤', 'SELECT_EMOJI_🥤'),
                Markup.button.callback('🍰', 'SELECT_EMOJI_🍰'),
                Markup.button.callback('🥗', 'SELECT_EMOJI_🥗'),
                Markup.button.callback('🍜', 'SELECT_EMOJI_🍜'),
                Markup.button.callback('🌮', 'SELECT_EMOJI_🌮'),
                Markup.button.callback('🍣', 'SELECT_EMOJI_🍣'),
                Markup.button.callback('📦', 'SELECT_EMOJI_📦'),
                Markup.button.callback('🔙 Orqaga', 'BACK_TO_NAME'),
                Markup.button.callback('❌ Bekor qilish', 'CANCEL_ADD_CATEGORY'),
            ], { columns: 3 })
        );
    }

    @Action('CONFIRM_ADD_CATEGORY')
    async onConfirmAddCategory(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as AddCategorySceneState;

        if (!sceneState.name || !sceneState.emoji) {
            await ctx.editMessageText('❌ Ma\'lumotlar noto\'g\'ri.');
            await ctx.scene.leave();
            return;
        }

        try {
            const newCategory = await this.prisma.category.create({
                data: {
                    name: sceneState.name,
                    emoji: sceneState.emoji,
                },
            });

            await ctx.editMessageText(
                `✅ Yangi kategoriya muvaffaqiyatli qo'shildi!\n\n📝 Nomi: ${newCategory.name}\n😊 Emoji: ${newCategory.emoji}`
            );
            await ctx.scene.leave();
        } catch (error) {
            console.error('Category creation error:', error);
            
            let errorMessage = '❌ Kategoriya qo\'shishda xatolik yuz berdi.';
            
            if (error instanceof Error) {
                if (error.message.includes('duplicate')) {
                    errorMessage = '❌ Bu nom bilan kategoriya allaqachon mavjud.';
                } else if (error.message.includes('validation')) {
                    errorMessage = '❌ Ma\'lumotlar noto\'g\'ri.';
                }
            }

            await ctx.editMessageText(
                `${errorMessage}\n\nQaytadan urinib ko'ring.`,
                Markup.inlineKeyboard([
                    Markup.button.callback('🔄 Qaytadan', 'RETRY_ADD_CATEGORY'),
                    Markup.button.callback('❌ Bekor qilish', 'CANCEL_ADD_CATEGORY'),
                ])
            );
        }
    }

    @Action('RETRY_ADD_CATEGORY')
    async onRetryAddCategory(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as AddCategorySceneState;
        sceneState.awaitingName = true;
        sceneState.awaitingEmoji = false;
        sceneState.name = undefined;
        sceneState.emoji = undefined;

        await ctx.editMessageText(
            '📦 Yangi kategoriya qo\'shish\n\n📝 Kategoriya nomini kiriting:',
            Markup.inlineKeyboard([
                Markup.button.callback('❌ Bekor qilish', 'CANCEL_ADD_CATEGORY'),
            ])
        );
    }

    @Action('CANCEL_ADD_CATEGORY')
    async onCancelAddCategory(@Ctx() ctx: Context) {
        await ctx.editMessageText('❌ Kategoriya qo\'shish bekor qilindi.');
        await ctx.scene.leave();
    }
}