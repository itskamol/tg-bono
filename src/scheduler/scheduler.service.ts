import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { ReportsService } from '../reports/reports.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class SchedulerService implements OnModuleInit {
    private readonly logger = new Logger(SchedulerService.name);
    private readonly jobName = 'daily_report';

    constructor(
        private readonly reportsService: ReportsService,
        private readonly schedulerRegistry: SchedulerRegistry,
        private readonly prisma: PrismaService,
    ) { }

    async onModuleInit() {
        this.logger.log('Initializing scheduler...');
        await this.updateCronJobFromSettings();
    }

    async updateCronJobFromSettings() {
        try {
            const existingJob = this.schedulerRegistry.getCronJob(this.jobName);
            existingJob.stop();
            this.schedulerRegistry.deleteCronJob(this.jobName);
            this.logger.log(`Stopped and removed existing cron job: ${this.jobName}`);
        } catch (e) {
            // Job doesn't exist, which is fine.
        }

        const scheduleSetting = await this.prisma.setting.findUnique({
            where: { key: 'schedule_config' },
        });

        if (!scheduleSetting) {
            this.logger.log('No schedule configured. Job not started.');
            return;
        }

        const config = JSON.parse(scheduleSetting.value);

        if (config.enabled) {
            const job = new CronJob(config.cron, async () => {
                this.logger.log(`Executing scheduled job: ${this.jobName}`);

                // Assume the scheduled report is for the super admin and is a daily report
                const schedulerUser = {
                    role: Role.SUPER_ADMIN,
                    id: 'scheduler',
                };
                const timeRange = 'DAILY';

                try {
                    if (config.destination === 'email') {
                        const success = await this.reportsService.sendReportByEmail(schedulerUser, timeRange, true);
                        if (!success) {
                            this.logger.error('Scheduled email report failed');
                        }
                    } else if (config.destination === 'sheets') {
                        const success = await this.reportsService.sendReportToGoogleSheets(schedulerUser, timeRange, true);
                        if (!success) {
                            this.logger.error('Scheduled Google Sheets report failed - check Google Sheets API configuration');
                        }
                    } else if (config.destination === 'both') {
                        // Send to both email and Google Sheets
                        const results = await this.reportsService.sendReportToAllConfiguredDestinations(schedulerUser, timeRange);
                        if (!results.email) {
                            this.logger.error('Scheduled email report failed');
                        }
                        if (!results.sheets) {
                            this.logger.error('Scheduled Google Sheets report failed - check Google Sheets API configuration');
                        }
                    }
                } catch (error) {
                    this.logger.error(`Scheduled report execution failed: ${error.message}`);
                }
            });

            this.schedulerRegistry.addCronJob(this.jobName, job);
            job.start();

            this.logger.log(`Scheduled job "${this.jobName}" started with cron: ${config.cron}`);
        } else {
            this.logger.log('Scheduler is disabled in settings. Job not started.');
        }
    }
}
