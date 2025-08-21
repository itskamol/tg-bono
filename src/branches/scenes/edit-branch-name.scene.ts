import { Scene, SceneEnter, On, Message, Ctx } from 'nestjs-telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';

interface EditBranchNameSceneState {
    branchId: string;
}

@Scene('edit-branch-name-scene')
export class EditBranchNameScene {
    constructor(private readonly prisma: PrismaService) {}

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as EditBranchNameSceneState;
        const branch = await this.prisma.branch.findUnique({
            where: { id: sceneState.branchId },
        });

        if (!branch) {
            await ctx.reply('❌ Filial topilmadi.');
            await ctx.scene.leave();
            return;
        }

        await ctx.reply(`🏪 Hozirgi nom: ${branch.name}\n\nYangi filial nomini kiriting:`);
    }

    @On('text')
    async onText(@Ctx() ctx: Context, @Message('text') text: string) {
        const sceneState = ctx.scene.state as EditBranchNameSceneState;

        // Check if branch name already exists
        const existingBranch = await this.prisma.branch.findUnique({
            where: { name: text },
        });

        if (existingBranch && existingBranch.id !== sceneState.branchId) {
            await ctx.reply('❌ Bu nom bilan filial allaqachon mavjud. Boshqa nom kiriting:');
            return;
        }

        try {
            await this.prisma.branch.update({
                where: { id: sceneState.branchId },
                data: { name: text },
            });

            await ctx.reply(`✅ Filial nomi "${text}" ga o'zgartirildi.`);
            await ctx.scene.leave();
        } catch {
            await ctx.reply("❌ Filial nomini o'zgartirishda xatolik yuz berdi.");
            await ctx.scene.leave();
        }
    }
}
