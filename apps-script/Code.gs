/**
 * AFTER TAKEOFF — guest list & RSVP backend for Dana & Vlad.
 * Lives inside a Google Sheet (Extensions → Apps Script).
 *
 * First time: run setup() once from the editor, then Deploy → New deployment →
 * Web app · Execute as: Me · Who has access: Anyone. Copy the /exec URL.
 *
 * Tabs:
 *   Invitations  Code | Display name | Short name | Greeting | Party size | Lookup names
 *   RSVP         Updated at | Code | Household | Attending | Guests | Dietary | Message | Changes
 */

const INV = "Invitations";
const RSVP = "RSVP";
const MAX_FAILED_PER_MINUTE = 40;

function setup() {
  const ss = SpreadsheetApp.getActive();
  let inv = ss.getSheetByName(INV);
  if (!inv) {
    inv = ss.insertSheet(INV);
    inv.appendRow(["Code", "Display name", "Short name", "Greeting", "Party size", "Lookup names (comma-separated)"]);
    inv.appendRow([newCode_(), "Elena & Andrei Popescu", "Elena & Andrei", "Elena & Andrei", 2, "Elena Popescu, Andrei Popescu"]);
    inv.setFrozenRows(1);
    inv.getRange("A:A").setNumberFormat("@");
  }
  let r = ss.getSheetByName(RSVP);
  if (!r) {
    r = ss.insertSheet(RSVP);
    r.appendRow(["Updated at", "Code", "Household", "Attending", "Guests", "Dietary", "Message", "Changes"]);
    r.setFrozenRows(1);
    r.getRange("B:B").setNumberFormat("@");
  }
}

/** Fills empty Code cells on the Invitations tab with unique random codes. */
function fillMissingCodes() {
  const sh = SpreadsheetApp.getActive().getSheetByName(INV);
  const values = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 2).getValues();
  const used = new Set(values.map(v => String(v[0]).trim()).filter(Boolean));
  values.forEach((v, i) => {
    if (!String(v[0]).trim() && String(v[1]).trim()) {
      let c; do { c = newCode_(); } while (used.has(c));
      used.add(c);
      sh.getRange(i + 2, 1).setValue(c);
    }
  });
}

/** Writes each household's personal invitation link into column G. Set SITE_URL first. */
const SITE_URL = "https://dani-wed.github.io/dana-vlad/";
function writeInviteLinks() {
  const sh = SpreadsheetApp.getActive().getSheetByName(INV);
  sh.getRange(1, 7).setValue("Personal link");
  const n = sh.getLastRow() - 1; if (n < 1) return;
  const codes = sh.getRange(2, 1, n, 1).getValues();
  sh.getRange(2, 7, n, 1).setValues(codes.map(c => [c[0] ? SITE_URL + "?invite=" + c[0] : ""]));
}

function doGet() { return json_({ ok: true, service: "after-takeoff" }); }

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (body.action === "checkin") return json_(checkin_(body));
    if (body.action === "rsvp") return json_(rsvp_(body));
    return json_({ ok: false, error: "unknown_action" });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: "server" });
  }
}

function checkin_(b) {
  if (throttled_()) return { ok: false, error: "rate_limited" };
  const invs = readInvitations_();
  let inv = null;
  if (b.code) {
    const code = cleanCode_(b.code);
    inv = invs.find(i => i.code === code);
  } else {
    const n = normalize_(b.name);
    if (n.split(" ").length < 2) return { ok: false, error: "invalid" };
    const rev = n.split(" ").reverse().join(" ");
    inv = invs.find(i => i.names.indexOf(n) > -1 || i.names.indexOf(rev) > -1);
  }
  if (!inv) { countFailure_(); return { ok: false, error: "not_found" }; }
  return { ok: true, invitation: public_(inv), rsvp: findRsvp_(inv.code) };
}

function rsvp_(b) {
  const inv = readInvitations_().find(i => i.code === cleanCode_(b.invitationCode));
  if (!inv) return { ok: false, error: "not_found" };
  const attending = b.attending === true;
  const guests = attending ? Number(b.guests) : 0;
  if (attending && (!Number.isInteger(guests) || guests < 1 || guests > inv.partySize)) return { ok: false, error: "invalid_guests" };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = SpreadsheetApp.getActive().getSheetByName(RSVP);
    const row = [new Date(), inv.code, inv.displayName, attending ? "Yes" : "No", guests,
      safe_(attending ? b.dietary : "", 300), safe_(b.message, 500)];
    const found = findRsvpRow_(sh, inv.code);
    if (found) {
      const changes = Number(sh.getRange(found, 8).getValue()) || 0;
      sh.getRange(found, 1, 1, 8).setValues([row.concat([changes + 1])]);
      return { ok: true, updated: true };
    }
    sh.appendRow(row.concat([0]));
    return { ok: true, updated: false };
  } finally {
    lock.releaseLock();
  }
}

/* ---------- helpers ---------- */
function readInvitations_() {
  const rows = SpreadsheetApp.getActive().getSheetByName(INV).getDataRange().getValues();
  rows.shift();
  return rows.filter(r => String(r[0]).trim() && String(r[1]).trim()).map(r => ({
    code: cleanCode_(r[0]),
    displayName: String(r[1]).trim(),
    shortName: String(r[2] || r[1]).trim(),
    greeting: String(r[3] || r[1]).trim(),
    partySize: Math.max(1, parseInt(r[4], 10) || 1),
    names: String(r[5] || "").split(/[,;\n]/).map(normalize_).filter(Boolean)
  }));
}
function public_(i) { return { code: i.code, displayName: i.displayName, shortName: i.shortName, greeting: i.greeting, partySize: i.partySize }; }
function findRsvpRow_(sh, code) {
  const last = sh.getLastRow(); if (last < 2) return 0;
  const codes = sh.getRange(2, 2, last - 1, 1).getValues();
  for (let k = 0; k < codes.length; k++) if (cleanCode_(codes[k][0]) === code) return k + 2;
  return 0;
}
function findRsvp_(code) {
  const sh = SpreadsheetApp.getActive().getSheetByName(RSVP);
  const r = findRsvpRow_(sh, code); if (!r) return null;
  const v = sh.getRange(r, 1, 1, 7).getValues()[0];
  return { attending: v[3] === "Yes", guests: Number(v[4]) || 0, dietary: unsafe_(v[5]), message: unsafe_(v[6]) };
}
function normalize_(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z\s'-]/g, " ").replace(/[\s'-]+/g, " ").trim();
}
function cleanCode_(c) { return String(c || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16); }
function newCode_() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s = "";
  for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}
// Stops guest text being read as a spreadsheet formula.
function safe_(s, max) { s = String(s || "").trim().slice(0, max); return /^[=+\-@]/.test(s) ? "'" + s : s; }
function unsafe_(s) { return String(s || ""); }
function throttled_() { return (Number(CacheService.getScriptCache().get("fails")) || 0) >= MAX_FAILED_PER_MINUTE; }
function countFailure_() {
  const c = CacheService.getScriptCache();
  c.put("fails", String((Number(c.get("fails")) || 0) + 1), 60);
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
