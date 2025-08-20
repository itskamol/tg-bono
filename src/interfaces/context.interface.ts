import { Context as TelegrafContext, Scenes } from 'telegraf';
import { Branch, User } from '@prisma/client';

export interface Context extends TelegrafContext {
  user?: User & { branch: Branch };
  scene: Scenes.SceneContextScene<Context, Scenes.WizardSessionData>;
  wizard: Scenes.WizardContextWizard<Context>;
}
