import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { ReportsService } from '../reports/reports.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { Role } from 'src/auth/enums/role.enum';

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);
  private readonly jobName = 'daily_report';

  constructor(
    private readonly reportsService: ReportsService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly prisma: PrismaService,
  ) {}

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

        if (config.destination === 'email') {
          // Assume the scheduled report is for the super admin and is a daily report
          const schedulerUser = { role: Role.SUPER_ADMIN, id: 'scheduler' };
          const timeRange = 'DAILY';
          await this.reportsService.sendReportByEmail(schedulerUser, timeRange);
        }
      });

      this.schedulerRegistry.addCronJob(this.jobName, job);
      job.start();

      this.logger.log(
        `Scheduled job "${this.jobName}" started with cron: ${config.cron}`,
      );
    } else {
      this.logger.log('Scheduler is disabled in settings. Job not started.');
    }
  }
}
