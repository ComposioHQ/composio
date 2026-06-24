import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import {
  Member,
  DEFAULT_STANDUP_TIME,
  DEFAULT_STANDUP_TIMEZONE,
  CRON_SLOT_MINUTES,
  DEMO_MODE,
} from "../../standup.config";

dayjs.extend(utc);
dayjs.extend(timezone);

/** "soham.basu@…" → "Soham Basu". Keeps raw emails out of the public channel. */
export function memberName(member: Member): string {
  return member.slackEmail
    .split("@")[0]
    .split(/[._]/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

export function formatToday(): string {
  return dayjs().tz(DEFAULT_STANDUP_TIMEZONE).format("dddd, MMMM D, YYYY");
}

/** Draft lookback: Monday reaches back to Friday, else the previous day.
 *  Computed in the member's own timezone so the window matches their day. */
export function lookbackWindow(
  timezone: string = DEFAULT_STANDUP_TIMEZONE
): { date: string; label: string } {
  const now = dayjs().tz(timezone);
  const days = now.day() === 1 ? 3 : 1;
  return {
    date: now.subtract(days, "day").format("YYYY-MM-DD"),
    label: days === 1 ? "since yesterday" : "since your last standup",
  };
}

const memberStandupTime = (m: Member) => m.standupTime ?? DEFAULT_STANDUP_TIME;
const memberTimezone = (m: Member) => m.standupTimezone ?? DEFAULT_STANDUP_TIMEZONE;

/** Is this member due in the current cron slot, evaluated in their timezone? */
export function isMemberDue(member: Member): boolean {
  if (DEMO_MODE) return true;
  const now = dayjs().tz(memberTimezone(member));
  const nowMin = now.hour() * 60 + now.minute();
  const slotStart = Math.floor(nowMin / CRON_SLOT_MINUTES) * CRON_SLOT_MINUTES;
  const [h, m] = memberStandupTime(member).split(":").map(Number);
  const memberMin = h * 60 + m;
  return memberMin >= slotStart && memberMin < slotStart + CRON_SLOT_MINUTES;
}
