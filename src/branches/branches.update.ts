import { UseGuards } from '@nestjs/common';
import {
  Update,
  Command,
  Ctx,
  Scene,
  SceneEnter,
  On,
  Message,
} from 'nestjs-telegraf';
import { AuthGuard } from '../auth/guards/auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { PrismaService } from '../prisma/prisma.service';
import { Context } from '../interfaces/context.interface';

@Update()
@UseGuards(AuthGuard)
export class BranchesUpdate {
  constructor(private readonly prisma: PrismaService) {}

  @Command('list_branches')
  @Roles(Role.SUPER_ADMIN)
  async listBranches(@Ctx() ctx: Context) {
    const branches = await this.prisma.branch.findMany();
    if (branches.length === 0) {
      return 'No branches found.';
    }
    const branchList = branches
      .map((b) => `- ${b.name} (${b.address})`)
      .join('\n');
    return `Here are the existing branches:\n${branchList}`;
  }

  @Command('add_branch')
  @Roles(Role.SUPER_ADMIN)
  async onAddBranch(@Ctx() ctx: Context) {
    await ctx.scene.enter('add-branch-scene');
  }
}

@Scene('add-branch-scene')
export class AddBranchScene {
  constructor(private readonly prisma: PrismaService) {}

  @SceneEnter()
  async onSceneEnter(@Ctx() ctx: Context) {
    await ctx.reply('Please enter the name for the new branch.');
  }

  @On('text')
  async onText(@Ctx() ctx: Context, @Message('text') text: string) {
    const sceneState = ctx.scene.state as any;

    if (!sceneState.name) {
      sceneState.name = text;
      await ctx.reply(`Branch name set to "${text}". Now, please enter the address.`);
      return;
    }

    if (!sceneState.address) {
      sceneState.address = text;
      const { name, address } = sceneState;

      await this.prisma.branch.create({
        data: {
          name,
          address,
        },
      });

      await ctx.reply(`Successfully created branch "${name}" at "${address}".`);
      await ctx.scene.leave();
    }
  }
}
