import { Context as TelegrafContext, Scenes } from 'telegraf';
import { User as UserModel } from '@prisma/client';

export interface Context extends TelegrafContext {
  user?: UserModel;
  scene: Scenes.SceneContextScene<Scenes.WizardScene>;
}
