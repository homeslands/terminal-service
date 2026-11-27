/**
 * Step 9.1 - run the wallet reconciliation Z-8 by hand, REPORT ONLY.
 *
 * Same check as the daily job (`WalletReconcileScheduler`, 04:00), without its
 * one repair (re-sending a missing points add): this script never writes. Use
 * it to look at a window right now, or a wider window than the job's 72 hours.
 *
 *   npx ts-node -r tsconfig-paths/register src/scripts/reconcile-wallet.ts \
 *     --shared-db=shared_user_db --since=2026-11-21T11:00:00+07:00 \
 *     [--lookback-hours=72] [--grace-minutes=30] [--db=terminal_db]
 *
 * --shared-db / --since default to WALLET_RECONCILE_SHARED_USER_DB /
 * WALLET_RECONCILE_SINCE; --db defaults to DATABASE_NAME (.env). The account
 * of .env must be able to SELECT on the shared-user schema (v0: both schemas
 * on the same MySQL instance).
 *
 * Exit code: 0 = no mismatch, 2 = mismatches printed, 1 = could not run.
 */
import { createConnection } from 'mysql2/promise';
import { DEFAULT_CUSTOMER_SHARED_ID } from 'src/user/user.constant';
import { SERVICE_PREFIX } from 'src/shared/constants/service-ref.constant';
import {
  reconcileWallet,
  WALLET_RECONCILE_GRACE_MINUTES,
  WALLET_RECONCILE_LOOKBACK_HOURS,
} from 'src/wallet-reconcile/wallet-reconcile';

const PERCENTAGE_KEY = 'ACCUMULATED_POINTS_PERCENTAGE';

const say = (line: string) => process.stdout.write(`${line}\n`);

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

function numberArg(name: string, fallback: number): number {
  const raw = arg(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`--${name}=${raw} is not a non-negative number`);
  }
  return value;
}

async function main(): Promise<number> {
  const sharedUserDb =
    arg('shared-db') ?? process.env.WALLET_RECONCILE_SHARED_USER_DB?.trim();
  const sinceRaw = arg('since') ?? process.env.WALLET_RECONCILE_SINCE?.trim();
  const since = sinceRaw ? new Date(sinceRaw) : null;
  if (!sharedUserDb) throw new Error('--shared-db is required');
  if (!since || Number.isNaN(since.getTime())) {
    throw new Error('--since must be the wallet cutover time (ISO 8601)');
  }
  const lookbackHours = numberArg(
    'lookback-hours',
    WALLET_RECONCILE_LOOKBACK_HOURS,
  );
  const graceMinutes = numberArg(
    'grace-minutes',
    WALLET_RECONCILE_GRACE_MINUTES,
  );
  const database = arg('db') ?? process.env.DATABASE_NAME;

  const conn = await createConnection({
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT),
    user: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    database,
  });
  try {
    const query = async (sql: string, params: unknown[] = []) =>
      (await conn.query(sql, params))[0] as Array<Record<string, unknown>>;
    const [config] = await query(
      'SELECT value_column AS v FROM system_config_tbl WHERE key_column = ? AND deleted_at_column IS NULL',
      [PERCENTAGE_KEY],
    );
    const pointsPercentage = Number.parseInt(String(config?.v ?? '0'), 10) || 0;

    const report = await reconcileWallet(query, {
      sharedUserDb,
      since,
      lookbackHours,
      graceMinutes,
      pointsPercentage,
      defaultCustomerSharedId: DEFAULT_CUSTOMER_SHARED_ID,
      servicePrefix: SERVICE_PREFIX,
    });

    say(
      `[Z-8] ${database} x ${sharedUserDb}: window max(${since.toISOString()}, now-${lookbackHours}h) .. now-${graceMinutes}min, points ${pointsPercentage}%`,
    );
    say(
      `[Z-8] checked ${report.ordersChecked} finalized order(s), ${report.keysChecked} ${SERVICE_PREFIX}:* transaction(s): ${report.findings.length} mismatch(es)`,
    );
    for (const f of report.findings) {
      say(`${f.kind}\t${f.key}\t${f.detail}`);
    }
    return report.findings.length === 0 ? 0 : 2;
  } finally {
    await conn.end();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    process.stderr.write(`[Z-8] could not run: ${error?.message ?? error}\n`);
    process.exit(1);
  });
