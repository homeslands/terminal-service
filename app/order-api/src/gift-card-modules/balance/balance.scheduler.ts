import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import { SharedBalanceService } from "src/shared/services/shared-balance.service";

@Injectable()
export class BalanceScheduler {
    constructor(
        private readonly sharedBalanceService: SharedBalanceService,
        @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
    ) {
    }

    @Cron("0 0 * * * *") // Run every 1 hour
    async creatingBalanceForExistingUsersTask() {
        const context = `${BalanceScheduler.name}.${this.creatingBalanceForExistingUsersTask.name}`;
        this.logger.log(`RUNNING creating balance for existing users task`, context);
        await this.sharedBalanceService.creatingBalanceForExistingUsersTask();
    }
}