// Builds the deployable site into docs/ (GitHub Pages serves this folder).
//   node build.mjs                                            → prototype mode (sample invitations, RSVPs not sent)
//   node build.mjs https://script.google.com/macros/s/…/exec  → live mode
// Source: src/head.html (styles) + src/body.html (markup) + src/i18n.js (translations) + src/app.js (logic)
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { webcrypto as crypto } from "node:crypto";

const ENDPOINT = (process.argv[2] || process.env.RSVP_ENDPOINT || "").trim();
if (ENDPOINT && !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(ENDPOINT)) {
  console.error("The endpoint should look like https://script.google.com/macros/s/<id>/exec");
  process.exit(1);
}

const SALT = "dv0409-after-takeoff";
// Must match normalize() in src/app.js and apps-script/Code.gs
const CYR = { а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"io",ж:"j",з:"z",и:"i",й:"i",к:"c",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"h",ц:"t",ч:"c",ш:"s",щ:"sc",ъ:"",ы:"i",ь:"",э:"e",ю:"iu",я:"ia",і:"i",ї:"i",є:"e",ґ:"g" };
function normalize(s){
  let x = String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  x = x.replace(/[а-яёіїєґ]/g, c => CYR[c] ?? "");
  x = x.replace(/[^a-z\s'-]/g, " ").replace(/[\s'-]+/g, " ").trim();
  return x.split(" ").map(w => w.replace(/ph/g, "f").replace(/ch/g, "c").replace(/sh/g, "s").replace(/zh/g, "j").replace(/kh/g, "h")
    .replace(/gh/g, "g").replace(/[kq]/g, "c").replace(/w/g, "v").replace(/y/g, "i").replace(/x/g, "cs")
    .replace(/([cg])i(?=[aou])/g, "$1").replace(/(.)\1+/g, "$1")).join(" ");
}
const enc = new TextEncoder();
const sha = t => crypto.subtle.digest("SHA-256", enc.encode(t));
const hex = b => Buffer.from(b).toString("hex");
const b64 = b => Buffer.from(b).toString("base64");

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

const read = f => readFile(new URL(`./src/${f}`, import.meta.url), "utf8");
const [head, body, i18n, app] = await Promise.all(["head.html", "body.html", "i18n.js", "app.js"].map(read));
const appBuilt = app.replace("/*__INVITATIONS__*/[]", JSON.stringify(records)).replace("/*__SALT__*/", SALT).replace("/*__ENDPOINT__*/", ENDPOINT);

const html = `<!doctype html>
<html lang="ro">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#080A0F">
<meta name="robots" content="noindex, nofollow">
<meta property="og:title" content="After Takeoff · Dana & Vlad">
<meta property="og:description" content="O călătorie privată · 04 septembrie 2027 · Madison Park">
<meta property="og:type" content="website">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
${head}
</head>
<body>
${body}
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script>
${i18n}
${appBuilt}
</script>
</body>
</html>
`;
await mkdir(new URL("./docs/", import.meta.url), { recursive: true });
await writeFile(new URL("./docs/index.html", import.meta.url), html);
await writeFile(new URL("./docs/.nojekyll", import.meta.url), "");
console.log(`Built docs/index.html in ${ENDPOINT ? "LIVE mode" : "PROTOTYPE mode"}.`);
