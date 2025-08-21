import { Scene, SceneEnter, On, Message, Ctx } from 'nestjs-telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';

interface EditBranchAddressSceneState {
    branchId: string;
}

@Scene('edit-branch-address-scene')
export class EditBranchAddressScene {
    constructor(private readonly prisma: PrismaService) {}

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as EditBranchAddressSceneState;
        const branch = await this.prisma.branch.findUnique({
            where: { id: sceneState.branchId },
        });

        if (!branch) {
            await ctx.reply('❌ Filial topilmadi.');
            await ctx.scene.leave();
            return;
        }

        await ctx.reply(`📍 Hozirgi manzil: ${branch.address}\n\nYangi manzilni kiriting:`);
    }

    @On('text')
    async onText(@Ctx() ctx: Context, @Message('text') text: string) {
        const sceneState = ctx.scene.state as EditBranchAddressSceneState;

        try {
            await this.prisma.branch.update({
                where: { id: sceneState.branchId },
                data: { address: text },
            });

            await ctx.reply(`✅ Filial manzili "${text}" ga o'zgartirildi.`);
            await ctx.scene.leave();
        } catch {
            await ctx.reply("❌ Filial manzilini o'zgartirishda xatolik yuz berdi.");
            await ctx.scene.leave();
        }
    }
}
