import { Scene, SceneEnter, On, Message, Action, Ctx } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';

interface AddCategorySceneState {
    name?: string;
    awaitingName?: boolean;
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

        // Kategoriya nomi
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

            // Tasdiqlash
            await ctx.reply(
                `📋 Yangi kategoriya ma'lumotlari:\n\n📝 Nomi: ${trimmedName}\n\nTasdiqlaysizmi?`,
                Markup.inlineKeyboard([
                    Markup.button.callback('✅ Ha, qo\'shish', 'CONFIRM_ADD_CATEGORY'),
                    Markup.button.callback('🔙 Orqaga', 'BACK_TO_NAME'),
                    Markup.button.callback('❌ Bekor qilish', 'CANCEL_ADD_CATEGORY'),
                ], { columns: 1 })
            );
            return;
        }
    }



    @Action('BACK_TO_NAME')
    async onBackToName(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as AddCategorySceneState;
        sceneState.awaitingName = true;
        sceneState.name = undefined;

        await ctx.editMessageText(
            '📦 Yangi kategoriya qo\'shish\n\n📝 Kategoriya nomini kiriting:',
            Markup.inlineKeyboard([
                Markup.button.callback('❌ Bekor qilish', 'CANCEL_ADD_CATEGORY'),
            ])
        );
    }

    @Action('CONFIRM_ADD_CATEGORY')
    async onConfirmAddCategory(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as AddCategorySceneState;

        if (!sceneState.name) {
            await ctx.editMessageText('❌ Ma\'lumotlar noto\'g\'ri.');
            await ctx.scene.leave();
            return;
        }

        try {
            const newCategory = await this.prisma.category.create({
                data: {
                    name: sceneState.name,
                    emoji: '📦', // Default emoji
                },
            });

            await ctx.editMessageText(
                `✅ Yangi kategoriya muvaffaqiyatli qo'shildi!\n\n📝 Nomi: ${newCategory.name}`
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
        sceneState.name = undefined;

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