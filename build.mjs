// Builds the deployable site into docs/ (GitHub Pages serves this folder).
//   node build.mjs                       → prototype mode (sample invitations, RSVPs not sent)
//   node build.mjs https://script.google.com/macros/s/…/exec   → live mode
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { webcrypto as crypto } from "node:crypto";

const ENDPOINT = (process.argv[2] || process.env.RSVP_ENDPOINT || "").trim();
if (ENDPOINT && !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(ENDPOINT)) {
  console.error("The endpoint should look like https://script.google.com/macros/s/<id>/exec");
  process.exit(1);
}

const SALT = "dv0409-after-takeoff";
const normalize = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z\s'-]/g, " ").replace(/[\s'-]+/g, " ").trim();
const enc = new TextEncoder();
const sha = t => crypto.subtle.digest("SHA-256", enc.encode(t));
const hex = b => Buffer.from(b).toString("hex");
const b64 = b => Buffer.from(b).toString("base64");

// Sample invitations are only embedded in prototype mode.
const records = [];
if (!ENDPOINT) {
  const { invitations } = JSON.parse(await readFile(new URL("./data/mock-invitations.json", import.meta.url)));
  for (const inv of invitations) {
    const { lookupNames, ...publicRecord } = inv;
    for (const name of lookupNames) {
      const n = normalize(name);
      const key = await crypto.subtle.importKey("raw", await sha(`${SALT}|key|${n}`), "AES-GCM", false, ["encrypt"]);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(publicRecord)));
      records.push({ id: hex(await sha(`${SALT}|id|${n}`)), iv: b64(iv), ct: b64(ct) });
    }
  }
  records.sort(() => Math.random() - .5);
}

let body = await readFile(new URL("./src/template.html", import.meta.url), "utf8");
body = body.replace("/*__INVITATIONS__*/[]", JSON.stringify(records))
           .replace("/*__SALT__*/", SALT)
           .replace("/*__ENDPOINT__*/", ENDPOINT);

// The template is written as page content; wrap it in a full document for static hosting.
const cut = body.indexOf("</style>") + "</style>".length;
const head = body.slice(0, cut), rest = body.slice(cut);
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#080A0F">
<meta name="robots" content="noindex, nofollow">
<meta property="og:title" content="After Takeoff · Dana & Vlad">
<meta property="og:description" content="A private journey · 04 September 2027 · Madison Park">
<meta property="og:type" content="website">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
${head}
</head>
<body>
${rest}
</body>
</html>
`;
await mkdir(new URL("./docs/", import.meta.url), { recursive: true });
await writeFile(new URL("./docs/index.html", import.meta.url), html);
await writeFile(new URL("./docs/.nojekyll", import.meta.url), "");
console.log(`Built docs/index.html in ${ENDPOINT ? "LIVE mode" : "PROTOTYPE mode"}.`);
