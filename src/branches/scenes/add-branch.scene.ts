import { Scene, SceneEnter, On, Message, Action, Ctx } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';

interface AddBranchSceneState {
    name?: string;
    address?: string;
}

@Scene('add-branch-scene')
export class AddBranchScene {
    constructor(private readonly prisma: PrismaService) {}

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        await ctx.reply(
            '🏪 Yangi filial yaratish\n\nFilial nomini kiriting:',
            Markup.inlineKeyboard([
                Markup.button.callback('❌ Bekor qilish', 'CANCEL_ADD_BRANCH'),
            ])
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
                await ctx.reply('❌ Bu nom bilan filial allaqachon mavjud. Boshqa nom kiriting:');
                return;
            }

            sceneState.name = text;
            await ctx.reply(
                '✅ Filial nomi saqlandi.\n\n📍 Filial manzilini kiriting:',
                Markup.inlineKeyboard([
                    Markup.button.callback('❌ Bekor qilish', 'CANCEL_ADD_BRANCH'),
                ])
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

                await ctx.reply(
                    `✅ Filial muvaffaqiyatli yaratildi!\n\n` +
                        `🏪 Nomi: ${newBranch.name}\n` +
                        `📍 Manzil: ${newBranch.address}`,
                );
                await ctx.scene.leave();
            } catch {
                await ctx.reply('❌ Filial yaratishda xatolik yuz berdi.');
                await ctx.scene.leave();
            }
            return;
        }
    }

    @Action('CANCEL_ADD_BRANCH')
    async onCancelAddBranch(@Ctx() ctx: Context) {
        await ctx.editMessageText('❌ Filial qo\'shish bekor qilindi.');
        await ctx.scene.leave();
    }
}
