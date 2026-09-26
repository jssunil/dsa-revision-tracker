/* Google Calendar.
 *  - Always available: "Add to Google Calendar" template links and .ics downloads (no setup).
 *  - With an OAuth client ID (Settings, stored encrypted): Google Identity Services token client +
 *    Calendar API v3 to create / update / delete events. The access token lives in memory only.
 *    Each event carries extendedProperties.private.dsaRevId so a retry never duplicates it.
 */
import { googleCfg } from "./store.js";
import { pad } from "./util.js";

const SCOPE = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly";
const API = "https://www.googleapis.com/calendar/v3";

export const tz = () => googleCfg().timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;

// ---- event model: { id, summary, description, date:"YYYY-MM-DD", time:"HH:MM", durationMin, reminderMin } ----
function wall(date, time, plusMin) {
  const [h, m] = (time || "19:00").split(":").map(Number);
  const t = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), h, m) + (plusMin || 0) * 60000);
  return t.getUTCFullYear() + "-" + pad(t.getUTCMonth() + 1) + "-" + pad(t.getUTCDate()) + "T" + pad(t.getUTCHours()) + ":" + pad(t.getUTCMinutes()) + ":00";
}
const compact = (s) => s.replace(/[-:]/g, "");

export function templateUrl(ev) {
  const q = new URLSearchParams({
    action: "TEMPLATE", text: ev.summary, details: ev.description || "",
    dates: compact(wall(ev.date, ev.time)) + "/" + compact(wall(ev.date, ev.time, ev.durationMin)), ctz: tz()
  });
  return "https://calendar.google.com/calendar/render?" + q.toString();
}
function icsEscape(s) { return String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => "\\" + c); }
export function icsText(ev) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//DSA Revision Tracker//EN", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
    "UID:" + ev.id + "@dsa-tracker", "DTSTAMP:" + stamp,
    "DTSTART;TZID=" + tz() + ":" + compact(wall(ev.date, ev.time)),
    "DTEND;TZID=" + tz() + ":" + compact(wall(ev.date, ev.time, ev.durationMin)),
    "SUMMARY:" + icsEscape(ev.summary), "DESCRIPTION:" + icsEscape(ev.description),
    "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsEscape(ev.summary), "TRIGGER:-PT" + (ev.reminderMin || 30) + "M", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR", ""
  ].join("\r\n");
}

// ---- OAuth (Google Identity Services token model) ----
let token = null, tokenExp = 0, client = null, clientFor = null, gis = null;
export const hasClient = () => !!googleCfg().clientId;
export const connected = () => !!token && Date.now() < tokenExp - 60000;

function loadGis() {
  if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
  if (gis) return gis;
  gis = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client"; s.async = true;
    s.onload = () => resolve(); s.onerror = () => { gis = null; reject(new Error("Couldn't load Google sign-in")); };
    document.head.appendChild(s);
  });
  return gis;
}
// interactive: true on a user click (may show the consent popup)
export async function connect(interactive) {
  const id = googleCfg().clientId;
  if (!id) throw new Error("Add your OAuth client ID in Settings → Google Calendar first");
  await loadGis();
  return new Promise((resolve, reject) => {
    if (!client || clientFor !== id) {
      clientFor = id;
      client = google.accounts.oauth2.initTokenClient({ client_id: id, scope: SCOPE, callback: () => {} });
    }
    client.callback = (resp) => {
      if (resp.error) { reject(new Error(resp.error_description || resp.error)); return; }
      token = resp.access_token; tokenExp = Date.now() + (resp.expires_in || 3600) * 1000;
      resolve(token);
    };
    client.error_callback = (e) => reject(new Error(e && e.message || (e && e.type) || "Sign-in was closed"));
    client.requestAccessToken({ prompt: interactive && !token ? "consent" : "" });
  });
}
export function disconnect() {
  if (token && window.google) google.accounts.oauth2.revoke(token, () => {});
  token = null; tokenExp = 0;
}
async function api(method, path, body, query) {
  if (!connected()) await connect(false);
  const url = API + path + (query ? "?" + new URLSearchParams(query).toString() : "");
  const r = await fetch(url, { method, headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 401) { token = null; throw new Error("Google sign-in expired — click Connect again"); }
  if (r.status === 204 || r.status === 410) return null;
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error("Google Calendar " + r.status + ": " + ((j && j.error && j.error.message) || r.statusText));
  return j;
}
export async function listCalendars() {
  const j = await api("GET", "/users/me/calendarList", null, { minAccessRole: "writer" });
  return (j.items || []).map((c) => ({ id: c.id, summary: c.summaryOverride || c.summary, primary: !!c.primary }));
}
function body(ev) {
  const g = googleCfg(), b = {
    summary: ev.summary, description: ev.description,
    start: { dateTime: wall(ev.date, ev.time), timeZone: tz() },
    end: { dateTime: wall(ev.date, ev.time, ev.durationMin), timeZone: tz() },
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: +ev.reminderMin || 30 }] },
    extendedProperties: { private: { dsaRevId: ev.id } }
  };
  if (g.colorId) b.colorId = String(g.colorId);
  return b;
}
// create or update; returns { eventId, calendarId, htmlLink, syncedAt }
export async function upsert(ev, existing) {
  const cal = encodeURIComponent((existing && existing.calendarId) || googleCfg().calendarId || "primary");
  let id = existing && existing.eventId;
  if (!id) {
    const found = await api("GET", "/calendars/" + cal + "/events", null, { privateExtendedProperty: "dsaRevId=" + ev.id, maxResults: "1" });
    id = found && found.items && found.items[0] && found.items[0].id;
  }
  let res;
  try {
    res = id ? await api("PATCH", "/calendars/" + cal + "/events/" + encodeURIComponent(id), body(ev))
      : await api("POST", "/calendars/" + cal + "/events", body(ev));
  } catch (e) {
    if (!id || !/404/.test(e.message)) throw e;
    res = await api("POST", "/calendars/" + cal + "/events", body(ev));   // event was deleted in Google: recreate
  }
  return { eventId: res.id, calendarId: decodeURIComponent(cal), htmlLink: res.htmlLink, syncedAt: new Date().toISOString() };
}
export async function remove(existing) {
  if (!existing || !existing.eventId) return;
  await api("DELETE", "/calendars/" + encodeURIComponent(existing.calendarId || "primary") + "/events/" + encodeURIComponent(existing.eventId))
    .catch((e) => { if (!/404|410/.test(e.message)) throw e; });
}
