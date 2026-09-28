import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

export const BOOKING_DATE_FORMAT = 'dd/mm/yyyy HH:mm';
export const BOOKING_DAY_FORMAT = 'dd/mm/yyyy';
export const BOOKING_TIME_FORMAT = 'HH:mm';

/**
 * Parse a `dd/mm/yyyy` string into the [start, end] of that calendar day (local
 * time). Used to filter bookings that fall on a given day. Returns null when the
 * input is malformed or not a real calendar date.
 */
export function getBookingDayRange(
  value: unknown,
): { start: Date; end: Date } | null {
  if (typeof value !== 'string') return null;

  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;

  const [, day, month, year] = match.map(Number);
  const start = new Date(year, month - 1, day, 0, 0, 0, 0);

  if (
    start.getFullYear() !== year ||
    start.getMonth() !== month - 1 ||
    start.getDate() !== day
  ) {
    return null;
  }

  const end = new Date(year, month - 1, day, 23, 59, 59, 999);
  return { start, end };
}

/**
 * Format a Date back into the `dd/mm/yyyy HH:mm` booking format (local time),
 * the inverse of parseBookingDate. Returns null for invalid input.
 */
export function formatBookingDate(value: unknown): string | null {
  if (!(value instanceof Date) || isNaN(value.getTime())) return null;

  const pad = (n: number) => String(n).padStart(2, '0');
  const day = pad(value.getDate());
  const month = pad(value.getMonth() + 1);
  const year = value.getFullYear();
  const hour = pad(value.getHours());
  const minute = pad(value.getMinutes());

  return `${day}/${month}/${year} ${hour}:${minute}`;
}

export function parseBookingDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;

  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/);
  if (!match) return null;

  const [, day, month, year, hour, minute] = match.map(Number);
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return null;
  }

  return date;
}

@ValidatorConstraint({ name: 'dateValidation', async: false })
export class DateValidation implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    const date = parseBookingDate(value);
    if (!date) return false;
    return date.getTime() >= Date.now();
  }

  defaultMessage(args: ValidationArguments): string {
    if (!parseBookingDate(args.value)) {
      return `Date must be in ${BOOKING_DATE_FORMAT} format`;
    }
    return 'Booking date must not be in the past';
  }
}
