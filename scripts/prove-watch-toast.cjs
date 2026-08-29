#!/usr/bin/env node
/** Calls fireWatchToast with a fake BIRTH flip. Proves title/body/click + 5m dedupe. */
const ts = require("typescript");
const fs = require("fs");
const path = require("path");
const Module = require("module");

const root = path.join(__dirname, "..", "src", "lib", "line");
const cache = new Map();

function loadTs(rel) {
  const abs = path.join(root, rel);
  if (cache.has(abs)) return cache.get(abs);
  const src = fs.readFileSync(abs, "utf8");
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      strict: true,
    },
    fileName: abs,
  });
  const m = { exports: {} };
  const wrapped = new Function("exports", "require", "module", "__filename", "__dirname", outputText);
  const req = (q) => {
    if (q === "./format") return loadTs("format.ts");
    if (q === "./alerts") return loadTs("alerts.ts");
    return Module.createRequire(abs)(q);
  };
  wrapped(m.exports, req, m, abs, path.dirname(abs));
  cache.set(abs, m.exports);
  return m.exports;
}

const {
  fireWatchToast,
  watchToastTitle,
  watchToastBody,
  watchToastHref,
  telegramWatchText,
  toastDedupeOk,
  birthWakeFlip,
  TOAST_COOLDOWN_MS,
} = loadTs("alerts.ts");

const fails = [];
function ok(cond, msg) {
  if (!cond) fails.push(msg);
  else console.log("ok  " + msg);
}

ok(watchToastTitle("BLUECHIP", "BIRTH") === "LINE · BLUECHIP · BIRTH", "title BIRTH");
ok(watchToastTitle("HMM", "WAKE") === "LINE · HMM · WAKE", "title WAKE");
ok(watchToastBody("O1", 12345, 45861.86) === "O1 · $12.3k · $45.9k", "body pad · mcap · 1h vol");
ok(watchToastHref("base", "0xabc") === "/t/base/0xabc", "click href /t/{chain}/{ca}");
ok(TOAST_COOLDOWN_MS === 5 * 60 * 1000, "cooldown 5m");

ok(birthWakeFlip(undefined, { birth: true }) === "BIRTH", "flip missing→BIRTH");
ok(birthWakeFlip({ birth: false, wake: false }, { birth: true, wake: false }) === "BIRTH", "flip false→BIRTH");
ok(birthWakeFlip({ birth: true, wake: false }, { birth: true, wake: true }) === "WAKE", "flip wake while birth");
ok(birthWakeFlip({ birth: true }, { birth: true }) === null, "no flip if already BIRTH");

const seen = {};
const now = 1_700_000_000_000;
const created = [];
const opens = [];
const handle = { onclick: null };
const baseOpts = {
  symbol: "BLUECHIP",
  kind: "BIRTH",
  pad: "O1",
  mcapUsd: 50000,
  vol1hUsd: 12000,
  chain: "base",
  ca: "0xb200000000000000000000cfbdf64a8706a94a01",
  seen,
  now,
  createNotification: (title, options) => {
    created.push({ title, options });
    return handle;
  },
  open: (href) => opens.push(href),
};

ok(fireWatchToast({ ...baseOpts, permission: "denied" }) === false, "denied = no toast");
ok(created.length === 0, "denied does not construct Notification");
ok(Object.keys(seen).length === 0, "denied does not consume cooldown");

const fired = fireWatchToast({ ...baseOpts, permission: "granted" });
ok(fired === true, "granted fake BIRTH fires");
ok(created.length === 1, "one Notification");
ok(created[0].title === "LINE · BLUECHIP · BIRTH", "Notification title");
ok(created[0].options.body === "O1 · $50k · $12k", "Notification body");
ok(created[0].options.silent === true, "silent toast");
handle.onclick();
ok(opens[0] === "/t/base/0xb200000000000000000000cfbdf64a8706a94a01", "click opens desk");

const again = fireWatchToast({ ...baseOpts, permission: "granted", now: now + 60_000, kind: "WAKE" });
ok(again === false, "same CA within 5m is deduped even on WAKE");
ok(created.length === 1, "no second Notification inside 5m");

const later = fireWatchToast({
  ...baseOpts,
  permission: "granted",
  now: now + TOAST_COOLDOWN_MS,
  kind: "WAKE",
});
ok(later === true, "same CA after 5m fires again");
ok(created[1].title === "LINE · BLUECHIP · WAKE", "second toast is WAKE after cooldown");

ok(toastDedupeOk({}, "base:0x1", now) === true, "empty seen allows");
ok(toastDedupeOk({ "base:0x1": now }, "base:0x1", now + TOAST_COOLDOWN_MS - 1) === false, "just under 5m blocked");
ok(toastDedupeOk({ "base:0x1": now }, "base:0x1", now + TOAST_COOLDOWN_MS) === true, "at 5m allowed");

const tg = telegramWatchText({
  symbol: "BLUECHIP",
  kind: "WAKE",
  pad: "O1",
  mcapUsd: 50000,
  vol1hUsd: 12000,
  chain: "base",
  ca: "0xb200000000000000000000cfbdf64a8706a94a01",
});
ok(tg === [
  "LINE · BLUECHIP · WAKE",
  "O1 · $50k · $12k",
  "0xb200000000000000000000cfbdf64a8706a94a01",
  "/t/base/0xb200000000000000000000cfbdf64a8706a94a01",
].join("\n"), "telegram 4-line WAKE message");

if (fails.length) {
  console.error("FAIL " + fails.length);
  for (const f of fails) console.error("  - " + f);
  process.exit(1);
}
console.log("ALL PASS");
