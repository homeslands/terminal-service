/**
 * LUOT BACKFILL USER terminal <-> shared-user - chay MOT LAN truoc khi cho
 * nhan vien dung terminal.
 *
 * Phuong an chot 05/10/2026 (progress/terminal-api.md, "Nguon du lieu khach
 * hang cua terminal"): **trend chay truoc va da co khach, terminal tich hop
 * sau nen terminal phai thich nghi - moi xung dot deu uu tien du lieu trend.**
 * Trend khong sua gi va khong bao gio thay khach cua terminal.
 *
 * ## Thu tu BAT BUOC: 0 -> A -> B -> doi chieu
 *
 * **Buoc 0 - don lien ket co san.** Migration `v4.0.0-01` gan placeholder
 * `shared_user_id = id_column`; mot so trung id that ben shared-user.
 *   - `root` -> doi SDT thanh `root-terminal`, go lien ket (no dang tro vao
 *     `root` cua trend). Buoc B se nhap no sang shared nhu mot nhan vien.
 *   - `default-customer` -> gan vao sentinel DUNG CHUNG ben shared.
 *   - Trung id + cung SDT, va LOAI TAI KHOAN KHOP (khach <-> owner NULL, hoac
 *     owner 'terminal') -> giu.
 *   - Trung id + cung SDT nhung loai KHONG khop (nhan vien tro vao danh tinh
 *     khach / danh tinh cua trend...) -> RETIRE.
 *   - Trung id nhung KHAC SDT -> lien ket gia, go ra (uuid ngau nhien) roi di
 *     tiep nhu hang chua lien ket.
 *
 * **Buoc A - keo khach shared (owner NULL) ve.** Voi moi khach:
 *   - hang terminal cung SDT la khach -> GAN vao hang cu (giu lich su), ghi de
 *     cache identity bang gia tri shared;
 *   - hang terminal cung SDT la nhan vien -> RETIRE hang do, tao hang moi;
 *   - khong co -> tao hang moi (`ensureLocalUser`).
 *
 * **Buoc B - hang con lai (chua lien ket, chua retire).**
 *   - khach -> RETIRE (khach chi co o terminal khong duoc day sang shared);
 *   - nhan vien ma SDT da co ben shared, bat ky owner nao -> RETIRE
 *     (ngoai le: danh tinh owner 'terminal' chua ai giu = lan chay truoc hong
 *     giua chung -> GAN);
 *   - nhan vien con lai -> NHAP sang shared (`POST /internal/users/import`,
 *     `isShared: false` => owner 'terminal'), giu hash mat khau, isActive,
 *     createdAt; trung email -> email rac.
 *
 * RETIRE = lam nhu `deleteAccount` (SDT rac, xoa sach identity, khoa) + doi
 * `sharedUserId` sang uuid ngau nhien. Khong xoa hang - FK cua don/ca lam/so
 * du/voucher van nguyen. Moi lan ghi de identity deu chep gia tri cu vao
 * `user_retire_backup_tbl` truoc (migration `v4.0.0-02`). Xem
 * `user/user-retire.helper.ts`.
 *
 * ## Cach chay
 *
 *   # Mac dinh: DRY RUN - chi do va in ke hoach, KHONG ghi gi ca.
 *   npx ts-node -r tsconfig-paths/register src/scripts/backfill-shared-user-ids.ts
 *
 *   # Ghi that:
 *   npx ts-node -r tsconfig-paths/register src/scripts/backfill-shared-user-ids.ts --execute
 *
 * Truoc `--execute`: dump `terminal_db` + `shared_user_db`, **TAT terminal
 * service** (cac lop dong bo QD19 se tao hang chen giua A va B), shared-user
 * da co route import, migration `v4.0.0-02` da chay. Dry run tinh tren ban
 * sao trong bo nho nen so lieu khop voi lan chay that.
 *
 * Idempotent: chay lai, hang da xu ly roi vao nhanh "giu" (da lien ket) hoac
 * duoc nhan ra qua tien to `retired-`.
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { AppModule } from '../app/app.module';
import { User } from '../user/user.entity';
import { RoleEnum } from '../role/role.enum';
import { UserProvisioningService } from '../user/user-provisioning.service';
import {
  IMPORT_CONFLICT_EMAIL,
  IMPORT_CONFLICT_PHONENUMBER,
  SharedUserLookupResponse,
  SharedUserServiceClient,
} from '../external-services/shared-user-service/shared-user-service.client';
import {
  backupUser,
  generateRetiredEmail,
  isRetiredPhonenumber,
  retireLocalUser,
} from '../user/user-retire.helper';
import { DEFAULT_CUSTOMER_PHONENUMBER } from '../accumulated-point/accumulated-point.utils';
import { INTERNAL_SERVICE_NAME } from '../common/constants/internal-api.constant';

// Cua so du rong de lay TOAN BO nguoi ben shared-user. Client tu phan trang.
const EPOCH = new Date('2000-01-01T00:00:00.000Z');

const ROOT_PHONENUMBER = 'root';
const ROOT_TERMINAL_PHONENUMBER = 'root-terminal';
const TERMINAL_OWNER = INTERNAL_SERVICE_NAME;

// Cung dinh dang ma shared-user kiem o route import (BCRYPT_HASH_PATTERN).
// Hash khong dung dinh dang (hoac NULL) => khong gui, shared-user sinh hash
// ngau nhien va nguoi do phai dat lai mat khau (QD16).
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
const DOB_PATTERN = /^(0[1-9]|[12]\d|3[0-1])\/(0[1-9]|1[0-2])\/(19|20)\d{2}$/;

type Step = '0' | 'A' | 'B';

type Action =
  | { kind: 'RENAME_ROOT'; user: User }
  | { kind: 'ATTACH_SENTINEL'; user: User; shared: SharedUserLookupResponse }
  | { kind: 'DETACH'; user: User; reason: string }
  | { kind: 'RETIRE'; step: Step; user: User; reason: string }
  | {
      kind: 'ATTACH';
      step: 'A' | 'B';
      user: User;
      shared: SharedUserLookupResponse;
      // Email lay tu shared ma da co hang cuc bo KHAC giu => de trong (cot
      // UNIQUE). Chi la cache, man hinh van ghep tu shared-user.
      dropEmail: boolean;
    }
  | { kind: 'PROVISION'; shared: SharedUserLookupResponse }
  | {
      kind: 'IMPORT';
      user: User;
      phonenumber: string;
      junkEmail: boolean;
      passwordHash?: string;
    };

const isCustomer = (user: User) =>
  // Role NULL tinh nhu khach - cung quy tac QD18 dung khi backfill owner_service.
  !user.role || user.role.name === RoleEnum.Customer;

const lower = (value?: string | null) => (value ?? '').toLowerCase();

const describe = (user: User) =>
  `${user.slug} [${user.role?.name ?? 'NO_ROLE'}] phonenumber=${user.phonenumber}`;

// ==========================================================================
// LAP KE HOACH - thuan trong bo nho, khong goi mang, khong ghi DB. Dry run va
// lan chay that dung CHUNG ham nay, nen so lieu dry run la so lieu that.
// ==========================================================================
function buildPlan(
  localUsers: User[],
  sharedUsers: SharedUserLookupResponse[],
): { actions: Action[]; warnings: string[]; kept: number } {
  const actions: Action[] = [];
  const warnings: string[] = [];

  const sharedById = new Map(sharedUsers.map((s) => [s.id, s]));
  const sharedByPhone = new Map(sharedUsers.map((s) => [s.phonenumber, s]));
  const sharedEmails = new Set(
    sharedUsers.filter((s) => s.email).map((s) => lower(s.email)),
  );
  // Danh tinh shared da co hang cuc bo giu (sau buoc 0/A) - khong cho hang
  // thu hai gan vao.
  const claimed = new Set<string>();
  // Hang cuc bo chua lien ket, chua retire - ung vien cua A va B. Khoa = SDT
  // SAU khi doi `root`.
  const unlinked = new Map<string, User>();
  const plannedPhone = new Map<string, string>();
  let kept = 0;

  const sharedSentinel = sharedByPhone.get(DEFAULT_CUSTOMER_PHONENUMBER);
  if (sharedSentinel) claimed.add(sharedSentinel.id);

  const rootTerminalTaken = localUsers.some(
    (u) => u.phonenumber === ROOT_TERMINAL_PHONENUMBER,
  );

  // ---------------------------------------------------------------- Buoc 0
  for (const user of localUsers) {
    if (isRetiredPhonenumber(user.phonenumber)) continue;

    if (user.phonenumber === DEFAULT_CUSTOMER_PHONENUMBER) {
      if (!sharedSentinel) {
        warnings.push(
          `shared-user KHONG co sentinel '${DEFAULT_CUSTOMER_PHONENUMBER}' - de nguyen hang ${user.slug}`,
        );
      } else if (user.sharedUserId !== sharedSentinel.id) {
        actions.push({ kind: 'ATTACH_SENTINEL', user, shared: sharedSentinel });
      } else {
        kept++;
      }
      continue;
    }

    if (user.phonenumber === ROOT_PHONENUMBER) {
      if (rootTerminalTaken) {
        warnings.push(
          `Da co hang '${ROOT_TERMINAL_PHONENUMBER}' - KHONG doi '${ROOT_PHONENUMBER}' (${user.slug}), can xu ly tay`,
        );
        continue;
      }
      actions.push({ kind: 'RENAME_ROOT', user });
      plannedPhone.set(user.id, ROOT_TERMINAL_PHONENUMBER);
      unlinked.set(ROOT_TERMINAL_PHONENUMBER, user);
      continue;
    }

    const shared = sharedById.get(user.sharedUserId);
    if (shared && shared.phonenumber === user.phonenumber) {
      const owner = shared.ownerService ?? null;
      if (owner === TERMINAL_OWNER || (owner === null && isCustomer(user))) {
        claimed.add(shared.id);
        kept++;
      } else {
        actions.push({
          kind: 'RETIRE',
          step: '0',
          user,
          reason: `linked to ${owner === null ? 'shared customer' : `'${owner}'`} identity but local role ${user.role?.name ?? 'NO_ROLE'}`,
        });
      }
      continue;
    }

    if (shared) {
      actions.push({
        kind: 'DETACH',
        user,
        reason: `placeholder ${user.sharedUserId} belongs to ${shared.phonenumber}`,
      });
    }
    unlinked.set(user.phonenumber, user);
  }

  // ---------------------------------------------------------------- Buoc A
  for (const shared of sharedUsers) {
    if ((shared.ownerService ?? null) !== null) continue;
    if (shared.phonenumber === DEFAULT_CUSTOMER_PHONENUMBER) continue;
    if (claimed.has(shared.id)) continue;

    const user = unlinked.get(shared.phonenumber);
    if (user && isCustomer(user)) {
      actions.push({
        kind: 'ATTACH',
        step: 'A',
        user,
        shared,
        dropEmail: false,
      });
      unlinked.delete(shared.phonenumber);
      claimed.add(shared.id);
      continue;
    }
    if (user) {
      actions.push({
        kind: 'RETIRE',
        step: 'A',
        user,
        reason: `staff phonenumber belongs to shared customer ${shared.id}`,
      });
      unlinked.delete(shared.phonenumber);
    }
    actions.push({ kind: 'PROVISION', shared });
    claimed.add(shared.id);
  }

  // ---------------------------------------------------------------- Buoc B
  for (const [phonenumber, user] of unlinked) {
    if (isCustomer(user)) {
      actions.push({
        kind: 'RETIRE',
        step: 'B',
        user,
        reason: 'terminal-only customer',
      });
      continue;
    }

    const shared = sharedByPhone.get(phonenumber);
    if (
      shared &&
      shared.ownerService === TERMINAL_OWNER &&
      !claimed.has(shared.id)
    ) {
      actions.push({
        kind: 'ATTACH',
        step: 'B',
        user,
        shared,
        dropEmail: false,
      });
      claimed.add(shared.id);
      continue;
    }
    if (shared) {
      actions.push({
        kind: 'RETIRE',
        step: 'B',
        user,
        reason: `phonenumber exists in shared-user (owner ${shared.ownerService ?? 'NULL'})`,
      });
      continue;
    }

    actions.push({
      kind: 'IMPORT',
      user,
      phonenumber,
      junkEmail: !!user.email && sharedEmails.has(lower(user.email)),
      passwordHash: BCRYPT_HASH_PATTERN.test(user.password ?? '')
        ? user.password
        : undefined,
    });
  }

  // Email cua danh tinh shared ma mot hang cuc bo KHAC dang giu => khong chep
  // xuong (cot UNIQUE). Kiem tren trang thai HIEN TAI vi lenh gan chay truoc
  // khi hang kia (neu co) bi retire.
  const localByEmail = new Map(
    localUsers.filter((u) => u.email).map((u) => [lower(u.email), u]),
  );
  for (const action of actions) {
    if (action.kind !== 'ATTACH' || !action.shared.email) continue;
    const holder = localByEmail.get(lower(action.shared.email));
    action.dropEmail = !!holder && holder.id !== action.user.id;
  }

  return { actions, warnings, kept };
}

// ==========================================================================
// THUC THI
// ==========================================================================
interface Outcome {
  provisioned: number;
  attached: User[];
  imported: Array<{
    user: User;
    sharedId: string;
    junkEmail: boolean;
    needsPasswordReset: boolean;
  }>;
  retiredStaff: Array<{ step: Step; snapshot: string; reason: string }>;
  retiredCustomers: number;
  failures: string[];
}

async function bootstrap() {
  const execute = process.argv.includes('--execute');
  const logger = new Logger('BackfillSharedUserIds');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const dataSource = app.get(DataSource);
    const userRepository: Repository<User> = app.get(getRepositoryToken(User));
    const client = app.get(SharedUserServiceClient);
    const provisioning = app.get(UserProvisioningService);
    const runId = randomUUID();

    logger.log(
      execute
        ? `EXECUTE run=${runId} - SE GHI vao terminal_db va shared_user_db`
        : 'DRY RUN - khong ghi gi (them --execute de ghi that)',
    );

    if (execute) {
      const [backupTable] = await dataSource.query(
        `SHOW TABLES LIKE 'user_retire_backup_tbl'`,
      );
      if (!backupTable) {
        throw new Error(
          'Chua co bang user_retire_backup_tbl - chay migration v4.0.0-02 truoc',
        );
      }
    }

    const sharedUsers = await client.listRecent(EPOCH, new Date());
    const localUsers = await userRepository.find({ relations: ['role'] });
    logger.log(
      `shared-user: ${sharedUsers.length} danh tinh | terminal_db: ${localUsers.length} hang`,
    );

    const { actions, warnings, kept } = buildPlan(localUsers, sharedUsers);
    printPlan(logger, actions, warnings, kept);

    if (!execute) {
      logger.log('DRY RUN xong - khong ghi gi.');
      return;
    }

    const outcome: Outcome = {
      provisioned: 0,
      attached: [],
      imported: [],
      retiredStaff: [],
      retiredCustomers: 0,
      failures: [],
    };

    const retire = async (user: User, step: Step, reason: string) => {
      const snapshot = describe(user);
      const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
      await retireLocalUser(dataSource.manager, user, {
        runId,
        reason: `[${step}] ${reason}`,
      });
      if (isCustomer(user)) {
        outcome.retiredCustomers++;
      } else {
        outcome.retiredStaff.push({
          step,
          snapshot: `${snapshot}${name ? ` name="${name}"` : ''}`,
          reason,
        });
      }
    };

    const attach = async (
      user: User,
      shared: SharedUserLookupResponse,
      dropEmail: boolean,
    ) => {
      await dataSource.manager.transaction(async (tx) => {
        await backupUser(tx, user, {
          runId,
          action: 'ATTACH',
          reason: `attach to shared ${shared.id}`,
        });
        const [day, month] = DOB_PATTERN.test(shared.dob ?? '')
          ? shared.dob.split('/')
          : [];
        Object.assign(user, {
          sharedUserId: shared.id,
          // Cache cuc bo ghi de theo shared - shared la nguon goc.
          firstName: shared.firstName ?? null,
          lastName: shared.lastName ?? null,
          email: dropEmail ? null : (shared.email ?? null),
          dob: shared.dob ?? null,
          dobDM: day && month ? `${day}${month}` : null,
          address: shared.address ?? null,
          image: shared.image ?? null,
          isActive: shared.isActive,
        });
        await tx.save(User, user);
      });
      outcome.attached.push(user);
    };

    // ------------------------------------------------------------ IMPORT
    const importStaff = async (
      action: Extract<Action, { kind: 'IMPORT' }>,
    ) => {
      const { user } = action;
      let junkEmail = action.junkEmail;
      let email = junkEmail ? generateRetiredEmail() : user.email;

      const send = () =>
        client.importUser({
          phonenumber: action.phonenumber,
          passwordHash: action.passwordHash,
          firstName: user.firstName ?? undefined,
          lastName: user.lastName ?? undefined,
          email: email ?? undefined,
          dob: user.dob ?? undefined,
          address: user.address ?? undefined,
          image: user.image ?? undefined,
          isActive: user.isActive,
          isVerifiedPhonenumber: user.isVerifiedPhonenumber,
          isVerifiedEmail: user.isVerifiedEmail,
          createdAt: user.createdAt
            ? new Date(user.createdAt).toISOString()
            : undefined,
          isShared: false,
        });

      let created: SharedUserLookupResponse;
      try {
        created = await send();
      } catch (error) {
        const status = error?.response?.status;
        const message = error?.response?.data?.message;
        if (status === 409 && message === IMPORT_CONFLICT_EMAIL && !junkEmail) {
          // Email vua bi chiem sau khi lap ke hoach - doi email rac, thu lai.
          junkEmail = true;
          email = generateRetiredEmail();
          created = await send();
        } else if (status === 409 && message === IMPORT_CONFLICT_PHONENUMBER) {
          // SDT vua bi chiem sau khi lap ke hoach (terminal service dang chay?
          // hay lan chay truoc da nhap ma chua kip ghi lien ket).
          const existing = await client.lookupByPhonenumber(action.phonenumber);
          const holder = existing
            ? await userRepository.exists({
                where: { sharedUserId: existing.id },
              })
            : true;
          if (existing?.ownerService === TERMINAL_OWNER && !holder) {
            await attach(user, existing, false);
          } else {
            await retire(
              user,
              'B',
              `phonenumber taken in shared-user during import (owner ${existing?.ownerService ?? 'NULL'})`,
            );
          }
          return;
        } else {
          throw error;
        }
      }

      try {
        await dataSource.manager.transaction(async (tx) => {
          if (junkEmail) {
            await backupUser(tx, user, {
              runId,
              action: 'IMPORT_EMAIL',
              reason: `email taken in shared-user, replaced with junk`,
            });
            user.email = email;
          }
          user.sharedUserId = created.id;
          await tx.save(User, user);
        });
      } catch (error) {
        // Da tao ben shared ma khong ghi duoc lien ket => bu tru, khong de mot
        // danh tinh mo coi ben kia (architect-http.md muc 1.2 quy tac 5).
        await client.revertCreatedUser(created.id).catch((revertError) =>
          logger.error(
            `revert-create ${created.id} FAILED: ${revertError.message}`,
          ),
        );
        throw error;
      }

      outcome.imported.push({
        user,
        sharedId: created.id,
        junkEmail,
        needsPasswordReset: !action.passwordHash,
      });
    };

    for (const action of actions) {
      try {
        switch (action.kind) {
          case 'RENAME_ROOT':
            await dataSource.manager.transaction(async (tx) => {
              await backupUser(tx, action.user, {
                runId,
                action: 'RENAME_ROOT',
                reason: `${ROOT_PHONENUMBER} -> ${ROOT_TERMINAL_PHONENUMBER}`,
              });
              action.user.phonenumber = ROOT_TERMINAL_PHONENUMBER;
              action.user.sharedUserId = randomUUID();
              await tx.save(User, action.user);
            });
            break;

          case 'ATTACH_SENTINEL':
            await dataSource.manager.transaction(async (tx) => {
              await backupUser(tx, action.user, {
                runId,
                action: 'ATTACH',
                reason: `sentinel -> shared ${action.shared.id}`,
              });
              action.user.sharedUserId = action.shared.id;
              await tx.save(User, action.user);
            });
            break;

          case 'DETACH':
            await dataSource.manager.transaction(async (tx) => {
              await backupUser(tx, action.user, {
                runId,
                action: 'DETACH',
                reason: action.reason,
              });
              action.user.sharedUserId = randomUUID();
              await tx.save(User, action.user);
            });
            break;

          case 'RETIRE':
            await retire(action.user, action.step, action.reason);
            break;

          case 'ATTACH':
            await attach(action.user, action.shared, action.dropEmail);
            break;

          case 'PROVISION': {
            const before = await userRepository.exists({
              where: { sharedUserId: action.shared.id },
            });
            await provisioning.ensureLocalUser(action.shared);
            if (!before) outcome.provisioned++;
            break;
          }

          case 'IMPORT':
            await importStaff(action);
            break;
        }
      } catch (error) {
        const who =
          'user' in action ? describe(action.user) : `shared ${action.shared.id}`;
        outcome.failures.push(`${action.kind} ${who}: ${error.message}`);
        logger.error(`${action.kind} ${who} FAILED: ${error.message}`);
      }
    }

    await reconcile(logger, userRepository, client);
    printOutcome(logger, outcome, runId);
  } finally {
    await app.close();
  }
}

// ==========================================================================
// IN KE HOACH / KET QUA
// ==========================================================================
function printPlan(
  logger: Logger,
  actions: Action[],
  warnings: string[],
  kept: number,
) {
  const count = (predicate: (a: Action) => boolean) =>
    actions.filter(predicate).length;
  const retires = actions.filter(
    (a): a is Extract<Action, { kind: 'RETIRE' }> => a.kind === 'RETIRE',
  );
  const imports = actions.filter(
    (a): a is Extract<Action, { kind: 'IMPORT' }> => a.kind === 'IMPORT',
  );

  logger.log('==================== KE HOACH ====================');
  logger.log(`[0] Giu nguyen (da lien ket, loai khop)  : ${kept}`);
  logger.log(`[0] Doi root -> root-terminal            : ${count((a) => a.kind === 'RENAME_ROOT')}`);
  logger.log(`[0] Gan sentinel default-customer        : ${count((a) => a.kind === 'ATTACH_SENTINEL')}`);
  logger.log(`[0] Go lien ket gia (trung id khac SDT)  : ${count((a) => a.kind === 'DETACH')}`);
  logger.log(`[0] Retire (lien ket sai loai)           : ${retires.filter((a) => a.step === '0').length}`);
  logger.log(`[A] Gan khach cu vao danh tinh shared    : ${count((a) => a.kind === 'ATTACH' && a.step === 'A')}`);
  logger.log(`[A] Retire nhan vien trung SDT khach     : ${retires.filter((a) => a.step === 'A').length}`);
  logger.log(`[A] Tao hang cuc bo moi cho khach shared : ${count((a) => a.kind === 'PROVISION')}`);
  logger.log(`[B] Retire khach chi co o terminal       : ${retires.filter((a) => a.step === 'B' && isCustomer(a.user)).length}`);
  logger.log(`[B] Retire nhan vien SDT da co o shared  : ${retires.filter((a) => a.step === 'B' && !isCustomer(a.user)).length}`);
  logger.log(`[B] Gan lai (lan chay truoc do dang)     : ${count((a) => a.kind === 'ATTACH' && a.step === 'B')}`);
  logger.log(`[B] Nhap nhan vien sang shared           : ${imports.length}`);
  logger.log(`    - phai dat lai mat khau (khong hash) : ${imports.filter((a) => !a.passwordHash).length}`);
  logger.log(`    - doi email rac (trung email shared) : ${imports.filter((a) => a.junkEmail).length}`);

  const staffRetires = retires.filter((a) => !isCustomer(a.user));
  if (staffRetires.length) {
    logger.warn('---- NHAN VIEN SE BI RETIRE (can tao tay tai khoan moi, SDT khac) ----');
    for (const a of staffRetires) {
      const name = [a.user.firstName, a.user.lastName].filter(Boolean).join(' ');
      logger.warn(`  [${a.step}] ${describe(a.user)}${name ? ` name="${name}"` : ''} - ${a.reason}`);
    }
  }
  if (imports.length) {
    logger.log('---- NHAN VIEN SE NHAP SANG shared-user (owner_service = terminal, BAT BIEN) ----');
    for (const a of imports) {
      const flags = [
        !a.passwordHash && 'CAN DAT LAI MAT KHAU',
        a.junkEmail && 'EMAIL RAC',
        !a.user.isActive && 'DANG KHOA',
      ].filter(Boolean);
      logger.log(`  ${describe(a.user)} -> ${a.phonenumber}${flags.length ? ` (${flags.join(', ')})` : ''}`);
    }
  }
  for (const warning of warnings) logger.warn(`CANH BAO: ${warning}`);
  logger.log('==================================================');
}

async function reconcile(
  logger: Logger,
  userRepository: Repository<User>,
  client: SharedUserServiceClient,
) {
  // Doc LAI ca hai ben sau khi ghi - danh tinh vua nhap phai co trong danh sach.
  const sharedUsers = await client.listRecent(EPOCH, new Date());
  const byId = new Map(sharedUsers.map((s) => [s.id, s]));
  const localUsers = await userRepository.find();
  const live = localUsers.filter((u) => !isRetiredPhonenumber(u.phonenumber));

  const unlinked = live.filter((u) => !byId.has(u.sharedUserId));
  const linkedIds = new Set(live.map((u) => u.sharedUserId));
  const onlyShared = sharedUsers.filter((s) => !linkedIds.has(s.id));

  // Dem RIENG "chi co o mot ben" voi "cung id khac gia tri" (architect-http.md
  // muc 0 diem 2). Hang moi tu cap chi co SDT => "local rong / shared co" KHONG
  // phai phan ky, chi dem khi CA HAI ben deu co gia tri.
  let divergent = 0;
  for (const local of live) {
    const shared = byId.get(local.sharedUserId);
    if (!shared) continue;
    const fields: Array<[string, unknown, unknown]> = [
      ['phonenumber', local.phonenumber, shared.phonenumber],
      ['firstName', local.firstName, shared.firstName],
      ['lastName', local.lastName, shared.lastName],
      ['email', local.email, shared.email],
      ['dob', local.dob, shared.dob],
    ];
    for (const [field, l, s] of fields) {
      if (l && s && l !== s) {
        divergent++;
        logger.warn(`  PHAN KY ${local.sharedUserId} ${field}: terminal="${l}" shared="${s}"`);
      }
    }
  }

  logger.log('==================== DOI CHIEU ====================');
  logger.log(`Hang song (khong retire) o terminal_db   : ${live.length}`);
  logger.log(`  - CHUA lien ket (phai = 0)            : ${unlinked.length}`);
  logger.log(`Danh tinh shared chua co hang o terminal : ${onlyShared.length} (nhan vien service khac - QD18)`);
  logger.log(`Phan ky that (ca hai co, khac nhau)      : ${divergent} field`);
  for (const u of unlinked) logger.warn(`  CHUA LIEN KET: ${u.slug} phonenumber=${u.phonenumber}`);
}

function printOutcome(logger: Logger, outcome: Outcome, runId: string) {
  logger.log('==================== KET QUA ====================');
  logger.log(`run_id (tra trong user_retire_backup_tbl) : ${runId}`);
  logger.log(`Gan vao danh tinh shared                  : ${outcome.attached.length}`);
  logger.log(`Tao hang cuc bo moi                       : ${outcome.provisioned}`);
  logger.log(`Nhap nhan vien sang shared                : ${outcome.imported.length}`);
  logger.log(`Retire khach                              : ${outcome.retiredCustomers}`);
  logger.log(`Retire nhan vien                          : ${outcome.retiredStaff.length}`);
  logger.log(`That bai                                  : ${outcome.failures.length}`);

  if (outcome.retiredStaff.length) {
    logger.warn('---- NHAN VIEN DA RETIRE - tao tay tai khoan moi voi SDT khac ----');
    for (const r of outcome.retiredStaff) {
      logger.warn(`  [${r.step}] ${r.snapshot} - ${r.reason}`);
    }
  }
  const needReset = outcome.imported.filter((i) => i.needsPasswordReset);
  if (needReset.length) {
    logger.warn('---- NHAP XONG NHUNG CHUA DANG NHAP DUOC - dat lai mat khau (QD16) ----');
    for (const i of needReset) {
      logger.warn(`  ${i.user.slug} phonenumber=${i.user.phonenumber} sharedUserId=${i.sharedId}`);
    }
  }
  const junk = outcome.imported.filter((i) => i.junkEmail);
  if (junk.length) {
    logger.warn('---- NHAP VOI EMAIL RAC (email cu da thuoc nguoi khac ben shared) ----');
    for (const i of junk) {
      logger.warn(`  ${i.user.slug} phonenumber=${i.user.phonenumber} email=${i.user.email}`);
    }
  }
  if (outcome.failures.length) {
    logger.error('---- THAT BAI - chay lai script sau khi xu ly ----');
    for (const f of outcome.failures) logger.error(`  ${f}`);
  }
  logger.log('=================================================');
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Backfill failed:', error);
  process.exit(1);
});
