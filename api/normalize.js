// api/normalize.js
import { DateTime } from "luxon";

// turn "j o h n dot doe at g mail dot com" -> "john.doe@gmail.com"
function normalizeSpokenEmail(raw = "") {
  let s = (" " + raw.toLowerCase().trim() + " ").replace(/\s+/g, " ");

  // spoken tokens -> symbols
  s = swapWord(s, /(at|at sign|symbol at)/g, "@");
  s = swapWord(s, /(dot|period)/g, ".");
  s = swapWord(s, /(underscore|under score)/g, "_");
  s = swapWord(s, /(dash|hyphen)/g, "-");
  s = swapWord(s, /(plus|plus sign)/g, "+");

  // number words -> digits
  const num = { zero:"0", oh:"0", o:"0", one:"1", two:"2", to:"2", too:"2",
    three:"3", four:"4", for:"4", five:"5", six:"6", seven:"7", eight:"8", ate:"8", nine:"9" };
  s = s.replace(/\b(zero|oh|o|one|two|to|too|three|four|for|five|six|seven|eight|ate|nine)\b/g, m => num[m]);

  // domain glue
  s = s.replace(/\bg\s*mail\b/g, "gmail")
       .replace(/\bhot\s*mail\b/g, "hotmail")
       .replace(/\bout\s*look\b/g, "outlook")
       .replace(/\byah+\s*oo\b/g, "yahoo")
       .replace(/\bproton\s*mail\b/g, "protonmail");

  // tighten spaces around @ and .
  s = s.replace(/\s*(?=@|\.)|\s+(?=[a-z0-9_+-])/g, "");
  s = s.replace(/\s+/g, "").replace(/\.+/g, ".");

  const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
  return EMAIL_RE.test(s) ? s : null;
}
function swapWord(s, re, repl) { return s.replace(new RegExp(`\\b${re.source}\\b`, "g"), ` ${repl} `); }

// turn "Aug 19th 3 PM" -> "2025-08-19T15:00:00-04:00"
function parseTimePhrase(timePhrase = "", tz = "America/New_York") {
  const cleaned = timePhrase.replace(/\b(\d{1,2})(st|nd|rd|th)\b/gi, "$1"); // 19th->19
  const formats = [
    "MMM d h a", "MMMM d h a", "MMM d ha", "MMMM d ha",
    "M/d h a", "M/d/yyyy h a", "MMM d yyyy h a", "MMMM d yyyy h a"
  ];
  for (const f of formats) {
    const dt = DateTime.fromFormat(cleaned, f, { zone: tz });
    if (dt.isValid) return dt.toISO(); // ISO with offset (keeps the correct time zone)
  }
  const iso = DateTime.fromISO(cleaned, { zone: tz });
  return iso.isValid ? iso.toISO() : null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  // simple optional security: require a token if set in Vercel
  const expected = process.env.NORMALIZER_TOKEN ? `Bearer ${process.env.NORMALIZER_TOKEN}` : null;
  const auth = req.headers.authorization || "";
  if (expected && auth !== expected) return res.status(401).json({ error: "Unauthorized" });

  const { raw_email, time_phrase, fallback_tz = "America/New_York" } = req.body || {};
  const normalized_email = normalizeSpokenEmail(raw_email || "");
  const start_iso = parseTimePhrase(time_phrase || "", fallback_tz);

  const tzName = DateTime.fromISO(start_iso || "", { setZone: true }).isValid
    ? DateTime.fromISO(start_iso, { setZone: true }).zoneName
    : fallback_tz;

  return res.status(200).json({
    normalized_email,
    start_iso,          // e.g., "2025-08-19T15:00:00-04:00"
    time_zone: tzName,  // e.g., "America/New_York"
    error: !normalized_email ? "email_validation_error"
          : !start_iso ? "time_parse_error"
          : null
  });
}
