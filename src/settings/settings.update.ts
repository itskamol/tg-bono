import { UseGuards } from '@nestjs/common';
import { Update, Command, Ctx, Action, Scene, SceneEnter, On, Message } from 'nestjs-telegraf';
import { AuthGuard } from '../auth/guards/auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { Context } from '../interfaces/context.interface';
import { Markup } from 'telegraf';
import { EncryptionService } from './encryption.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { Role } from '@prisma/client';

// Interfaces for Scene States
interface EmailSettingsSceneState {
    host?: string;
    port?: number;
    user?: string;
    pass?: string;
    recipient?: string;
}

interface ScheduleSettingsSceneState {
    cron?: string;
}

interface GoogleSheetsSettingsSceneState {
    sheetId?: string;
    serviceAccountJson?: string;
}

// Interfaces for Config Objects
interface EmailConfig {
    host: string;
    port: number;
    secure: boolean;
    auth: {
        user: string;
        pass: string;
    };
    recipient: string;
}

interface ScheduleConfig {
    cron: string;
    enabled: boolean;
    destination: string;
}

interface GoogleSheetsConfig {
    sheetId: string;
    credentials: string; // The service account JSON is stored as a string
}

interface ServiceAccountJson {
    type: string;
    private_key: string;
    // other fields are not needed for validation
}

@Update()
@UseGuards(AuthGuard)
export class SettingsUpdate {
    constructor(private readonly prisma: PrismaService) {}

    @Command('settings')
    @Roles(Role.SUPER_ADMIN)
    async onSettings(@Ctx() ctx: Context) {
        await ctx.reply(
            'Settings:',
            Markup.inlineKeyboard(
                [
                    Markup.button.callback('Configure Email Export', 'configure_email_export'),
                    Markup.button.callback(
                        'Configure Google Sheets Export',
                        'configure_g_sheets_export',
                    ),
                    Markup.button.callback('Configure Scheduled Reports', 'configure_schedule'),
                ],
                {
                    columns: 2,
                },
            ),
        );
    }

    @Action('configure_email_export')
    async onConfigureEmailExport(@Ctx() ctx: Context) {
        await ctx.scene.enter('email-settings-scene');
    }

    @Action('configure_g_sheets_export')
    async onConfigureGoogleSheetsExport(@Ctx() ctx: Context) {
        await ctx.scene.enter('g-sheets-settings-scene');
    }

    @Action('configure_schedule')
    async onConfigureSchedule(@Ctx() ctx: Context) {
        await ctx.scene.enter('schedule-settings-scene');
    }
}

@Scene('email-settings-scene')
export class EmailSettingsScene {
    constructor(
        private readonly prisma: PrismaService,
        private readonly encryptionService: EncryptionService,
    ) {}

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as EmailSettingsSceneState;
        sceneState.host = undefined;
        sceneState.port = undefined;
        sceneState.user = undefined;
        sceneState.pass = undefined;
        sceneState.recipient = undefined;

        await ctx.reply('Starting Email Export configuration...');
        await ctx.reply('Please enter the SMTP host (e.g., smtp.gmail.com).');
    }

    @On('text')
    async onText(@Ctx() ctx: Context, @Message('text') text: string) {
        const sceneState = ctx.scene.state as EmailSettingsSceneState;

        if (!sceneState.host) {
            sceneState.host = text;
            await ctx.reply(`Host set to "${text}". Now, please enter the SMTP port (e.g., 587).`);
            return;
        }

        if (!sceneState.port) {
            const port = parseInt(text, 10);
            if (isNaN(port)) {
                await ctx.reply('Invalid port. Please enter a number.');
                return;
            }
            sceneState.port = port;
            await ctx.reply(
                `Port set to ${port}. Now, please enter the username (sending email address).`,
            );
            return;
        }

        if (!sceneState.user) {
            sceneState.user = text;
            await ctx.reply(`Username set to "${text}". Now, please enter the password.`);
            return;
        }

        if (!sceneState.pass) {
            sceneState.pass = text;
            await ctx.reply(
                `Password has been received. Finally, please enter the recipient's email address.`,
            );
            return;
        }

        if (!sceneState.recipient) {
            sceneState.recipient = text;

            const emailConfig: EmailConfig = {
                host: sceneState.host,
                port: sceneState.port,
                secure: sceneState.port === 465, // Common practice
                auth: {
                    user: sceneState.user,
                    pass: sceneState.pass,
                },
                recipient: sceneState.recipient,
            };

            const encryptedConfig = this.encryptionService.encrypt(JSON.stringify(emailConfig));

            await this.prisma.setting.upsert({
                where: { key: 'email_config' },
                update: { value: encryptedConfig },
                create: { key: 'email_config', value: encryptedConfig },
            });

            await ctx.reply('Email export settings have been saved successfully!');
            await ctx.scene.leave();
        }
    }
}

@Scene('schedule-settings-scene')
export class ScheduleSettingsScene {
    constructor(
        private readonly prisma: PrismaService,
        private readonly schedulerService: SchedulerService,
    ) {}

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as ScheduleSettingsSceneState;
        sceneState.cron = undefined;
        await ctx.reply('Starting Scheduled Reports configuration...');
        await ctx.reply(
            'Please provide a cron string for the schedule. For example, `0 9 * * *` for every day at 9 AM. You can use a tool like crontab.guru to generate one.',
        );
    }

    @On('text')
    async onText(@Ctx() ctx: Context, @Message('text') text: string) {
        const sceneState = ctx.scene.state as ScheduleSettingsSceneState;

        if (!sceneState.cron) {
            const cronParts = text.split(' ');
            if (cronParts.length !== 5) {
                await ctx.reply('Invalid cron string. It must have 5 parts. Please try again.');
                return;
            }
            sceneState.cron = text;
            await ctx.reply(
                `Cron schedule set to \`${text}\`. Do you want to enable or disable this schedule?`,
                Markup.inlineKeyboard([
                    Markup.button.callback('Enable', 'schedule_enable'),
                    Markup.button.callback('Disable', 'schedule_disable'),
                ]),
            );
            return;
        }
    }

    @Action(/schedule_(.+)/)
    async onEnableDisable(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) return;
        const sceneState = ctx.scene.state as ScheduleSettingsSceneState;
        const action = ctx.callbackQuery.data.split('_')[1];
        const enabled = action === 'enable';

        const scheduleConfig: ScheduleConfig = {
            cron: sceneState.cron,
            enabled: enabled,
            destination: 'email', // Hardcoded for now
        };

        await this.prisma.setting.upsert({
            where: { key: 'schedule_config' },
            update: { value: JSON.stringify(scheduleConfig) },
            create: {
                key: 'schedule_config',
                value: JSON.stringify(scheduleConfig),
            },
        });

        await this.schedulerService.updateCronJobFromSettings();

        const status = enabled ? 'enabled' : 'disabled';
        await ctx.editMessageText(`Scheduled reports have been ${status}.`);
        await ctx.scene.leave();
    }
}

@Scene('g-sheets-settings-scene')
export class GoogleSheetsSettingsScene {
    constructor(
        private readonly prisma: PrismaService,
        private readonly encryptionService: EncryptionService,
    ) {}

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as GoogleSheetsSettingsSceneState;
        sceneState.sheetId = undefined;
        sceneState.serviceAccountJson = undefined;
        await ctx.reply('Starting Google Sheets Export configuration...');
        await ctx.reply('Please enter the Google Sheet ID.');
    }

    @On('text')
    async onText(@Ctx() ctx: Context, @Message('text') text: string) {
        const sceneState = ctx.scene.state as GoogleSheetsSettingsSceneState;

        if (!sceneState.sheetId) {
            sceneState.sheetId = text;
            await ctx.reply(
                `Sheet ID set. Now, please paste the entire content of the Service Account JSON file.`,
            );
            return;
        }

        if (!sceneState.serviceAccountJson) {
            try {
                const parsedJson = JSON.parse(text) as ServiceAccountJson;
                if (parsedJson.type !== 'service_account' || !parsedJson.private_key) {
                    await ctx.reply(
                        'Invalid Service Account JSON. It must contain "type": "service_account" and a "private_key". Please try again.',
                    );
                    return;
                }
                sceneState.serviceAccountJson = text;

                const gSheetsConfig: GoogleSheetsConfig = {
                    sheetId: sceneState.sheetId,
                    credentials: text,
                };

                const encryptedConfig = this.encryptionService.encrypt(
                    JSON.stringify(gSheetsConfig),
                );

                await this.prisma.setting.upsert({
                    where: { key: 'g_sheets_config' },
                    update: { value: encryptedConfig },
                    create: { key: 'g_sheets_config', value: encryptedConfig },
                });

                await ctx.reply('Google Sheets export settings have been saved successfully!');
                await ctx.scene.leave();
            } catch {
                await ctx.reply(
                    'The text you provided is not a valid JSON object. Please paste the exact content of the JSON file.',
                );
                return;
            }
        }
    }
}
