export const MAPPER_MODULE_PROVIDER = 'automapper:nestjs:default';
export enum QueueRegisterKey {
  MAIL = 'mail',
  NOTIFICATION = 'notification',
  JOB = 'job',
  PRINTER = 'printer',
  DISTRIBUTE_LOCK_JOB = 'distribute-lock-job',
  PRINTER_EVENT = 'printer-event',
  MIGRATE_FILE_FROM_DATABASE_TO_S3 = 'migrate-file-from-database-to-s3',
  SHARED_REDIS = 'shared-redis',
  PAYMENT_CALLBACK = 'payment-callback',
}

export enum DistributeLockJobKey {
  REFRESH_BRANCH_REVENUE = 'refresh-branch-revenue',
  GENERATE_MENU_EVERY_DAY_AT_1AM = 'generate-menu-every-day-at-1am',
  REFRESH_PRODUCT_ANALYSIS = 'refresh-product-analysis',
  // QD21 - LUOI RONG: 1 lan/ngay, cua so 48 gio. Vai tro la bu moi thu luoi
  // nhanh bo lo, va kiem luon CAM BIEN SUC KHOE cua luoi nhanh.
  SYNC_RECENTLY_REGISTERED_USERS = 'sync-recently-registered-users',
  // QD21 - LUOI NHANH: moi 10 phut, cua so 30 phut.
  //
  // KHOA RIENG, khong dung chung voi khoa cua luoi rong. Dung chung thi hai
  // job chan nhau - va dung luc can bu nhat (ngay sau mot dot su co) thi
  // luoi rong lai bi khoa.
  SYNC_RECENTLY_REGISTERED_USERS_FAST = 'sync-recently-registered-users-fast',
  // Buoc 9.1 - job doi soat vi/diem Z-8, 1 lan/ngay.
  RECONCILE_WALLET = 'reconcile-wallet',
  // Buoc 9.5 - nhieu replica: moi @Cron chi mot replica chay. Khoa cua job
  // theo lich GIU toi het TTL (khong release): replica lech dong ho vai giay
  // chay sau mot ban da xong nhanh thi van gap khoa va bo qua.
  SYNC_CAMPAIGN_STATUSES = 'sync-campaign-statuses',
  BIRTHDAY_CAMPAIGNS_EVERY_DAY_AT_1AM = 'birthday-campaigns-every-day-at-1am',
  UPDATE_USER_ROLE_EVERY_DAY_AT_3AM = 'update-user-role-every-day-at-3am',
}
