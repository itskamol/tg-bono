import { Scene, SceneEnter, On, Message, Action, Ctx } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';
import { safeEditMessageText } from '../../utils/telegram.utils';

interface AddBranchSceneState {
    name?: string;
    address?: string;
}

@Scene('add-branch-scene')
export class AddBranchScene {
    constructor(private readonly prisma: PrismaService) { }

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        await safeEditMessageText(
            ctx,
            '🏪 <b>Yangi filial yaratish</b>\n\nFilial nomini kiriting:',
            Markup.inlineKeyboard([Markup.button.callback('❌ Bekor qilish', 'CANCEL_ADD_BRANCH')]),
            'Yangi filial',
        );
    }

    @On('text')
    async onText(@Ctx() ctx: Context, @Message('text') text: string) {
        const sceneState = ctx.scene.state as AddBranchSceneState;

        // Step 1: Set branch name
        if (!sceneState.name) {
            // Check if branch name already exists
            const existingBranch = await this.prisma.branch.findUnique({
                where: { name: text },
            });

            if (existingBranch) {
                await safeEditMessageText(
                    ctx,
                    '❌ Bu nom bilan filial allaqachon mavjud. Boshqa nom kiriting:',
                    undefined,
                    'Xatolik',
                );
                return;
            }

            sceneState.name = text;
            await safeEditMessageText(
                ctx,
                `✅ Filial nomi saqlandi: <b>${text}</b>\n\n📍 Filial manzilini kiriting:`,
                Markup.inlineKeyboard([
                    Markup.button.callback('⏭️ Skip', 'SKIP_ADDRESS'),
                    Markup.button.callback('❌ Bekor qilish', 'CANCEL_ADD_BRANCH'),
                ]),
                'Filial nomi saqlandi',
            );
            return;
        }

        // Step 2: Set address and create branch
        if (!sceneState.address) {
            sceneState.address = text;

            try {
                const newBranch = await this.prisma.branch.create({
                    data: {
                        name: sceneState.name,
                        address: sceneState.address,
                    },
                });

                await safeEditMessageText(
                    ctx,
                    `✅ <b>Filial muvaffaqiyatli yaratildi!</b>\n\n` +
                    `🏪 <b>Nomi:</b> ${newBranch.name}\n` +
                    `📍 <b>Manzil:</b> ${newBranch.address}`,
                    undefined,
                    'Filial yaratildi',
                );
                await ctx.scene.leave();
            } catch {
                await safeEditMessageText(
                    ctx,
                    '❌ Filial yaratishda xatolik yuz berdi.',
                    undefined,
                    'Xatolik',
                );
                await ctx.scene.leave();
            }
            return;
        }
    }

    @Action('SKIP_ADDRESS')
    async onSkipAddress(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as AddBranchSceneState;

        if (!sceneState.name) {
            await safeEditMessageText(ctx, '❌ Filial nomi kiritilmagan.', undefined, 'Xatolik');
            await ctx.scene.leave();
            return;
        }

        try {
            const newBranch = await this.prisma.branch.create({
                data: {
                    name: sceneState.name,
                    address: 'Manzil kiritilmagan',
                },
            });

            await safeEditMessageText(
                ctx,
                `✅ <b>Filial muvaffaqiyatli yaratildi!</b>\n\n` +
                `🏪 <b>Nomi:</b> ${newBranch.name}\n` +
                `📍 <b>Manzil:</b> ${newBranch.address}`,
                undefined,
                'Filial yaratildi',
            );
            await ctx.scene.leave();
        } catch {
            await safeEditMessageText(
                ctx,
                '❌ Filial yaratishda xatolik yuz berdi.',
                undefined,
                'Xatolik',
            );
            await ctx.scene.leave();
        }
    }

    @Action('CANCEL_ADD_BRANCH')
    async onCancelAddBranch(@Ctx() ctx: Context) {
        await safeEditMessageText(
            ctx,
            "❌ Filial qo'shish bekor qilindi.",
            undefined,
            'Bekor qilindi',
        );
        await ctx.scene.leave();
    }
}
