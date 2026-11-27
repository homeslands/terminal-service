import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import Redlock from 'redlock';
import { DataSource } from 'typeorm';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { DistributeLockJobKey, QueueRegisterKey } from 'src/app/app.constants';
import { AccumulatedPointService } from 'src/accumulated-point/accumulated-point.service';
import { DEFAULT_CUSTOMER_SHARED_ID } from 'src/user/user.constant';
import { SERVICE_PREFIX } from 'src/shared/constants/service-ref.constant';
import {
  reconcileWallet,
  WALLET_RECONCILE_GRACE_MINUTES,
  WALLET_RECONCILE_LOOKBACK_HOURS,
  WalletFinding,
} from './wallet-reconcile';

/** So dong lech in ra log moi lan chay; phan con lai chi dem. */
const MAX_LOGGED_FINDINGS = 200;

export type WalletReconcileConfig =
  | { state: 'off' }
  | { state: 'invalid'; reason: string }
  | { state: 'on'; sharedUserDb: string; since: Date };

/**
 * Doc cau hinh LUC CHAY (khong luc nap tep): bien rong = job tat, giong
 * `USER_BIRTHDAY_QUEUE_PREFIX` cua 8.1 - deploy ban nay ma chua cap quyen
 * `SELECT` sang `shared_user_db` thi khong hong gi.
 *
 * - `WALLET_RECONCILE_SHARED_USER_DB`: ten schema `shared-user` tren CUNG
 *   instance MySQL (ban v0, xem `wallet-reconcile.ts`).
 * - `WALLET_RECONCILE_SINCE`: moc cutover vi 7.8 (ISO 8601). BAT BUOC khi bat:
 *   thieu moc thi don truoc cutover (khong co khoa debit/add) bi bao lech gia
 *   va bi cong diem lan hai.
 */
export function readWalletReconcileConfig(
  env: NodeJS.ProcessEnv = process.env,
): WalletReconcileConfig {
  const sharedUserDb = env.WALLET_RECONCILE_SHARED_USER_DB?.trim();
  if (!sharedUserDb) return { state: 'off' };
  if (!/^[A-Za-z0-9_$]+$/.test(sharedUserDb)) {
    return {
      state: 'invalid',
      reason: `WALLET_RECONCILE_SHARED_USER_DB=${JSON.stringify(sharedUserDb)} is not a schema name`,
    };
  }
  const sinceRaw = env.WALLET_RECONCILE_SINCE?.trim();
  const since = sinceRaw ? new Date(sinceRaw) : null;
  if (!since || Number.isNaN(since.getTime())) {
    return {
      state: 'invalid',
      reason: `WALLET_RECONCILE_SINCE=${JSON.stringify(sinceRaw ?? '')} must be the wallet cutover time (ISO 8601) when WALLET_RECONCILE_SHARED_USER_DB is set`,
    };
  }
  return { state: 'on', sharedUserDb, since };
}

/**
 * Buoc 9.1 - job doi soat vi/diem hai chieu (Z-8), luoi bu cua QD8 ("cong
 * diem hong van cho chot don, chi log").
 *
 * Lech thi CHI BAO (log `[Z-8]`), tru dung mot truong hop: don da chot thieu
 * `terminal:<slug>:add` => goi lai `addPointsForOrder` cung khoa - vi nuot lenh
 * neu thuc ra da ghi (`replayed`), nen goi lai vo hai. KHONG bao gio tru xu
 * hay hoan xu o day: tien tu sua la cach nhan doi loi.
 */
@Injectable()
export class WalletReconcileScheduler {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
    @InjectQueue(QueueRegisterKey.DISTRIBUTE_LOCK_JOB)
    private readonly distributeLockJobQueue: Queue,
    private readonly dataSource: DataSource,
    private readonly accumulatedPointService: AccumulatedPointService,
  ) {}

  // 04:00 - ngoai 01:00-03:00 (cron dem) va 17:00 (sinh nhat).
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async reconcileWallet() {
    const context = `${WalletReconcileScheduler.name}.${this.reconcileWallet.name}`;
    const config = readWalletReconcileConfig();
    if (config.state === 'off') {
      this.logger.log(
        `[Z-8] wallet reconciliation is off (WALLET_RECONCILE_SHARED_USER_DB is empty)`,
        context,
      );
      return;
    }
    if (config.state === 'invalid') {
      this.logger.error(`[Z-8] not run: ${config.reason}`, undefined, context);
      return;
    }

    const client = await this.distributeLockJobQueue.client;
    const redlock = new Redlock([client]);
    let lock: { release: () => Promise<unknown> } | null = null;
    try {
      lock = await redlock.acquire(
        [DistributeLockJobKey.RECONCILE_WALLET],
        1000 * 60 * 15,
      );
    } catch {
      this.logger.log(
        `[Z-8] another replica is already reconciling, skip`,
        context,
      );
      return;
    }

    try {
      const pointsPercentage =
        Number.parseInt(
          await this.accumulatedPointService.getAccumulatedPointsPercentage(),
          10,
        ) || 0;
      const report = await reconcileWallet(
        (sql, params) => this.dataSource.query(sql, params),
        {
          sharedUserDb: config.sharedUserDb,
          since: config.since,
          lookbackHours: WALLET_RECONCILE_LOOKBACK_HOURS,
          graceMinutes: WALLET_RECONCILE_GRACE_MINUTES,
          pointsPercentage,
          defaultCustomerSharedId: DEFAULT_CUSTOMER_SHARED_ID,
          servicePrefix: SERVICE_PREFIX,
        },
      );

      const summary = `[Z-8] checked ${report.ordersChecked} finalized order(s) and ${report.keysChecked} ${SERVICE_PREFIX}:* transaction(s) since max(${config.since.toISOString()}, now-${WALLET_RECONCILE_LOOKBACK_HOURS}h): ${report.findings.length} mismatch(es)`;
      if (report.findings.length === 0) {
        this.logger.log(summary, context);
        return;
      }
      this.logger.error(summary, undefined, context);
      report.findings
        .slice(0, MAX_LOGGED_FINDINGS)
        .forEach((f) =>
          this.logger.error(
            `[Z-8] ${f.kind} ${f.key}: ${f.detail}`,
            undefined,
            context,
          ),
        );
      if (report.findings.length > MAX_LOGGED_FINDINGS) {
        this.logger.error(
          `[Z-8] ${report.findings.length - MAX_LOGGED_FINDINGS} more mismatch(es) not logged`,
          undefined,
          context,
        );
      }

      await this.repairMissingAdds(
        report.findings.filter((f) => f.kind === 'MISSING_ADD'),
        pointsPercentage,
        context,
      );
    } catch (error) {
      this.logger.error(
        `[Z-8] wallet reconciliation failed: ${error?.message}`,
        error?.stack,
        context,
      );
    } finally {
      await lock.release().catch(() => undefined);
    }
  }

  /** Truong hop DUY NHAT duoc sua: goi lai `/add` cung khoa idempotent. */
  private async repairMissingAdds(
    findings: WalletFinding[],
    pointsPercentage: number,
    context: string,
  ): Promise<void> {
    let repaired = 0;
    for (const { key, order } of findings) {
      if (!order) continue;
      try {
        await this.accumulatedPointService.addPointsForOrder({
          sharedUserId: order.sharedUserId,
          orderId: order.id,
          orderSlug: order.slug,
          points: order.points,
          pointsPercentage,
        });
        repaired++;
        this.logger.warn(
          `[Z-8] re-sent the points add of order ${order.slug} (key ${key}, ${order.points} points)`,
          context,
        );
      } catch (error) {
        this.logger.error(
          `[Z-8] could not re-send the points add of order ${order.slug} (key ${key}): ${error?.message}`,
          error?.stack,
          context,
        );
      }
    }
    if (findings.length > 0) {
      this.logger.log(
        `[Z-8] re-sent ${repaired}/${findings.length} missing points add(s)`,
        context,
      );
    }
  }
}
