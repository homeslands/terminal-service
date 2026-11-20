/**
 * WALLET REPORT of terminal, READ ONLY. Step 6.12 prints it; it is printed
 * again in the wallet cutover window (7.8), before terminal's wallet tables
 * are frozen and renamed.
 *
 * QD-T1: the wallet in terminal's database is not imported into shared-user.
 * It is an overlapping fork of trend's wallet (point history rows with the
 * same ids, balances that drifted apart), so any merge counts twice or picks
 * a side at random. shared-user's ledger is filled from trend only (script
 * src/scripts/backfill-wallet-from-trend.ts of shared-user). What terminal
 * holds is printed here, to be attached to the cutover record before it is
 * dropped: every balance_tbl and accumulated_point_tbl row that is not 0, the
 * sharedUserId of its owner, and the figure trend holds for the same person.
 * point_transaction_tbl and accumulated_point_transaction_history_tbl are the
 * ledgers behind those figures; they stay in the frozen tables.
 *
 * It writes nothing: both databases are read inside READ ONLY transactions.
 *
 * ## How to run (from terminal/app/order-api, reads .env here)
 *
 *   npx ts-node -r tsconfig-paths/register src/scripts/backfill-wallet-report.ts \
 *     --trend-db=trend_db > wallet-report.tsv
 *
 * terminal's database is DATABASE_NAME of .env (or --terminal-db=). trend on
 * another server: set TREND_DATABASE_HOST|PORT|USERNAME|PASSWORD, each one
 * falling back to DATABASE_*.
 *
 * Output (stdout, tab separated, one line per row that is not 0):
 *   kind (balance | points), shared_user_id, terminal user slug,
 *   terminal figure, trend figure ('-' when trend has no row for the person),
 *   same | different | no trend row
 * followed by '#' lines with the totals.
 *
 * ## Names (rule 2)
 * By the time it runs again (8.9) balance_tbl, accumulated_point_tbl and
 * user_tbl.accumulated_point_column may carry the _deprecated_ prefix on
 * either side: both names are looked up in information_schema, finding both
 * or neither stops the run.
 */
import { config as dotenvConfig } from 'dotenv';
import { Connection, createConnection, RowDataPacket } from 'mysql2/promise';

dotenvConfig({ path: '.env' });

type Value = string | null;
type Row = Record<string, Value>;

interface Db {
  database: string;
  conn: Connection;
}

const USER_TABLE = 'user_tbl';
const BALANCE_TABLE = 'balance_tbl';
const POINTS_TABLE = 'accumulated_point_tbl';
const POINTS_LINK = 'accumulated_point_column';

const argValue = (name: string): string | undefined => {
  const prefix = `--${name}=`;
  return process.argv
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
};

const q = (name: string): string => `\`${name}\``;

const connect = async (envPrefix: string, database: string): Promise<Db> => {
  const env = (key: string) =>
    process.env[`${envPrefix}${key}`] ?? process.env[`DATABASE_${key}`];
  const conn = await createConnection({
    host: env('HOST'),
    port: Number(env('PORT')),
    user: env('USERNAME'),
    password: env('PASSWORD'),
    database,
    // Decimals as text: the figures print as stored.
    supportBigNumbers: true,
    bigNumberStrings: true,
  });
  return { database, conn };
};

const select = async (
  db: Db,
  sql: string,
  params: unknown[] = [],
): Promise<Row[]> => {
  const [rows] = await db.conn.query<RowDataPacket[]>(sql, params);
  return rows.map((row) => {
    const out: Row = {};
    for (const [column, value] of Object.entries(row)) {
      out[column] =
        value === null || value === undefined ? null : String(value);
    }
    return out;
  });
};

// The name in use, `name` or `_deprecated_name` (rule 2).
const oneOf = (where: string, found: string[], name: string): string => {
  if (found.length !== 1) {
    throw new Error(
      `${where}: expected exactly one of ${name} / _deprecated_${name}, ` +
        `found ${found.length} (${found.join(', ')})`,
    );
  }
  return found[0];
};

const resolveTable = async (db: Db, name: string): Promise<string> => {
  const found = await select(
    db,
    `SELECT table_name AS name FROM information_schema.tables
      WHERE table_schema = ? AND table_name IN (?)`,
    [db.database, [name, `_deprecated_${name}`]],
  );
  return oneOf(
    db.database,
    found.map((row) => row.name),
    name,
  );
};

const resolveLink = async (db: Db): Promise<string> => {
  const found = await select(
    db,
    `SELECT column_name AS name FROM information_schema.columns
      WHERE table_schema = ? AND table_name = ? AND column_name IN (?)`,
    [db.database, USER_TABLE, [POINTS_LINK, `_deprecated_${POINTS_LINK}`]],
  );
  return oneOf(
    `${db.database}.${USER_TABLE}`,
    found.map((row) => row.name),
    POINTS_LINK,
  );
};

interface Side {
  // One row per user: person, slug, balance (or null), points (or null).
  users: Row[];
  // Rows that are not 0 and that no user holds.
  orphanBalances: number;
  orphanPoints: number;
}

const readSide = async (db: Db): Promise<Side> => {
  const balance = q(await resolveTable(db, BALANCE_TABLE));
  const points = q(await resolveTable(db, POINTS_TABLE));
  const link = q(await resolveLink(db));
  await db.conn.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
  try {
    const users = await select(
      db,
      `SELECT u.shared_user_id_column AS person, u.slug_column AS slug,
              b.points_column AS balance, a.total_points_column AS points
         FROM ${q(USER_TABLE)} u
         LEFT JOIN ${balance} b ON b.user_column = u.id_column
         LEFT JOIN ${points} a ON a.id_column = u.${link}`,
    );
    const [orphans] = await select(
      db,
      `SELECT
         (SELECT COUNT(*) FROM ${balance} b
           WHERE b.points_column <> 0 AND NOT EXISTS
             (SELECT 1 FROM ${q(USER_TABLE)} u WHERE u.id_column = b.user_column)) AS balances,
         (SELECT COUNT(*) FROM ${points} a
           WHERE a.total_points_column <> 0 AND NOT EXISTS
             (SELECT 1 FROM ${q(USER_TABLE)} u WHERE u.${link} = a.id_column)) AS points`,
    );
    return {
      users,
      orphanBalances: Number(orphans.balances),
      orphanPoints: Number(orphans.points),
    };
  } finally {
    await db.conn.query('COMMIT');
  }
};

const isZero = (value: Value): boolean => value === null || Number(value) === 0;

const main = async (): Promise<void> => {
  const trendName = argValue('trend-db');
  const terminalName = argValue('terminal-db') ?? process.env.DATABASE_NAME;
  if (!trendName) throw new Error('Missing --trend-db=<trend database>');
  if (!terminalName) {
    throw new Error('Missing DATABASE_NAME in .env or --terminal-db=');
  }

  const dbs: Db[] = [];
  try {
    const terminalDb = await connect('DATABASE_', terminalName);
    dbs.push(terminalDb);
    const trendDb = await connect('TREND_DATABASE_', trendName);
    dbs.push(trendDb);
    const terminal = await readSide(terminalDb);
    const trend = await readSide(trendDb);

    const trendOf = new Map<string, Row[]>();
    for (const row of trend.users) {
      if (row.person === null) continue;
      if (!trendOf.has(row.person)) trendOf.set(row.person, []);
      trendOf.get(row.person).push(row);
    }

    const lines = [
      'kind\tshared_user_id\tterminal_user\tterminal\ttrend\tmatch',
    ];
    const totals: Record<string, Record<string, number>> = {};
    for (const kind of ['balance', 'points'] as const) {
      totals[kind] = { rows: 0, same: 0, different: 0, 'no trend row': 0 };
      for (const row of terminal.users) {
        if (isZero(row[kind])) continue;
        const figures = (
          row.person === null ? [] : (trendOf.get(row.person) ?? [])
        )
          .map((other) => other[kind])
          .filter((value) => value !== null);
        const match = !figures.length
          ? 'no trend row'
          : figures.length === 1 && Number(figures[0]) === Number(row[kind])
            ? 'same'
            : 'different';
        totals[kind].rows += 1;
        totals[kind][match] += 1;
        lines.push(
          [
            kind,
            row.person ?? '-',
            row.slug,
            row[kind],
            figures.length ? figures.join('/') : '-',
            match,
          ].join('\t'),
        );
      }
    }
    const total = (kind: string) =>
      `${totals[kind].rows} (same on trend ${totals[kind].same}, ` +
      `different ${totals[kind].different}, no trend row ${totals[kind]['no trend row']})`;
    lines.push(
      `# terminal ${terminalName} against trend ${trendName}, read ${new Date().toISOString()}`,
      `# balances not 0: ${total('balance')}`,
      `# points not 0: ${total('points')}`,
      `# rows not 0 that no terminal user holds: balances ${terminal.orphanBalances}, ` +
        `points ${terminal.orphanPoints}`,
    );
    process.stdout.write(`${lines.join('\n')}\n`);
  } finally {
    await Promise.all(dbs.map((db) => db.conn.end()));
  }
};

main().catch((error) => {
  process.stderr.write(`ERROR: ${error.message}\n`);
  process.exit(1);
});
