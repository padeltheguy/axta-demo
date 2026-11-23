import type { CalEvent } from "./calendar";
import { KIND_META } from "./calendar";

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
const compact = (iso: string) => iso.replace(/-/g, "");
const nextDay = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); const x = new Date(y, m - 1, d + 1); return `${x.getFullYear()}${String(x.getMonth() + 1).padStart(2, "0")}${String(x.getDate()).padStart(2, "0")}`; };
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
/** Coupe les lignes à 75 octets (RFC 5545). */
const fold = (line: string) => line.match(/.{1,73}/g)!.join("\r\n ");

/**
 * Export iCalendar (.ics) des échéances, avec deux rappels (J-7 et la veille).
 * Importé dans Google Agenda / Apple Calendrier, il déclenche notifications
 * et, si tu l'actives dans Google Agenda, des rappels par e-mail.
 */
export function toICS(events: CalEvent[], now = new Date()): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//axta//agenda//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:axta"];
  for (const e of events.filter((x) => !x.done)) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.key}@axta.local`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${compact(e.date)}`,
      `DTEND;VALUE=DATE:${nextDay(e.date)}`,
      fold(`SUMMARY:${esc(e.title)}`),
      fold(`DESCRIPTION:${esc(`${KIND_META[e.kind].label}${e.detail ? ` · ${e.detail}` : ""} — depuis axta`)}`),
      `CATEGORIES:${KIND_META[e.kind].label}`,
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(e.title)}`, "TRIGGER:-P7D", "END:VALARM",
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(e.title)}`, "TRIGGER:-P1D", "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
