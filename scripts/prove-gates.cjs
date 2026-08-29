#!/usr/bin/env node
/** Proves 6h default age+activity gates, lanes, BIRTH/WAKE, and copy-CA handler. */
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
    if (q.startsWith("./")) {
      const name = q.replace("./", "") + (q.endsWith(".ts") ? "" : ".ts");
      const file = ["types.ts", "lane.ts", "filters.ts", "risk.ts", "copyCa.ts", "radarPath.ts", "format.ts", "stage.ts"].find((f) => f === name || f === q.slice(2) + ".ts");
      if (file) return loadTs(file);
    }
    return Module.createRequire(abs)(q);
  };
  wrapped(m.exports, req, m, abs, path.dirname(abs));
  cache.set(abs, m.exports);
  return m.exports;
}

const { DEFAULT_FILTERS, applyFilters, minAgeSec, passesActivityGate } = loadTs("filters.ts");
const { inferLane, computeBirth, computeWake } = loadTs("lane.ts");
const { HOUR, DAY, ACTIVITY_VOL1H_USD, ACTIVITY_TX_1H } = loadTs("types.ts");
const { COPIED_HINT_MS } = loadTs("copyCa.ts");
const { parseAgeGateParam, hiddenUnderLabel } = loadTs("radarPath.ts");

const fails = [];
function ok(cond, msg) {
  if (!cond) fails.push(msg);
  else console.log("ok  " + msg);
}

function row(p) {
  return {
    id: (p.chain || "solana") + ":" + (p.ca || "Token111111111111111111111111111111111111111"),
    symbol: p.symbol || "RON",
    name: p.symbol || "RON",
    ca: p.ca || "Token111111111111111111111111111111111111111",
    chain: p.chain || "solana",
    pad: p.pad || "PUMP",
    quote: "SOL",
    lane: p.lane || "NEW",
    stage: p.stage || "GRADUATED",
    moving: false,
    heat: 10,
    risk: { level: "GREEN", flags: [] },
    vol1hUsd: p.vol1hUsd,
    vol24hUsd: p.vol24hUsd,
    buys: p.buys,
    sells: p.sells,
    ageSec: p.ageSec,
    mcapUsd: p.mcapUsd ?? 50000,
    liqUsd: p.liqUsd ?? 20000,
    curveFillPct: p.curveFillPct,
    firstSeenAt: "",
    updatedAt: "",
    sources: p.sources || ["dex:pumpfun"],
    links: { gmgn: "", dex: "", scan: "" },
    padSub: p.padSub,
    uniqueBuyers1h: p.uniqueBuyers1h,
    uniqueSellers1h: p.uniqueSellers1h,
    boostsActive: p.boostsActive,
    deployer: p.deployer,
    deployerLaunchCount7d: p.deployerLaunchCount7d,
  };
}

ok(DEFAULT_FILTERS.ageGate === "6h", "DEFAULT_FILTERS.ageGate is 6h");
ok(DEFAULT_FILTERS.curve === false, "Curve off by default");
ok(minAgeSec("6h") === 6 * HOUR, "minAgeSec 6h = 21600");
ok(minAgeSec(undefined) === 6 * HOUR, "minAgeSec default 6h");
ok(minAgeSec("1h") === HOUR, "minAgeSec 1h = 3600");
ok(minAgeSec("2h") === 2 * HOUR, "minAgeSec 2h = 7200");
ok(minAgeSec("any") === 0, "minAgeSec any = 0");
ok(parseAgeGateParam(null) === "6h", "parseAgeGateParam omitted = 6h");
ok(parseAgeGateParam("1h") === "1h", "parseAgeGateParam 1h");
ok(hiddenUnderLabel("6h") === "6h", "footer label 6h");
ok(ACTIVITY_VOL1H_USD === 5000, "activity 5k vol1h");
ok(COPIED_HINT_MS === 1000, "copied hint timeout 1000ms");

const ron1h = row({ symbol: "RON", ageSec: HOUR, vol1hUsd: 20000, stage: "GRADUATED", pad: "PUMP" });
const as1h = row({ symbol: "ASSE", ca: "Asse111111111111111111111111111111111111111", ageSec: 4000, vol1hUsd: 8000, stage: "GRADUATED" });
const sevenH = row({
  symbol: "SEVEN",
  ca: "Seven11111111111111111111111111111111111111",
  ageSec: 7 * HOUR,
  vol1hUsd: 20000,
  stage: "GRADUATED",
  pad: "PUMP",
});
const quiet7h = row({
  symbol: "DEAD",
  ca: "Dead111111111111111111111111111111111111111",
  ageSec: 7 * HOUR,
  vol1hUsd: 100,
  buys: 2,
  sells: 3,
  stage: "GRADUATED",
});
const tx7h = row({
  symbol: "TXS",
  ca: "Txs1111111111111111111111111111111111111111",
  ageSec: 7 * HOUR,
  vol1hUsd: 100,
  buys: 12,
  sells: 8,
  stage: "GRADUATED",
});
const book25h = row({
  symbol: "OLD",
  ca: "Old1111111111111111111111111111111111111111",
  ageSec: 25 * HOUR,
  vol1hUsd: 20000,
  stage: "GRADUATED",
});
const dustWake = row({
  symbol: "DUST",
  ca: "Dust111111111111111111111111111111111111111",
  ageSec: 30 * HOUR,
  vol1hUsd: 100,
  vol24hUsd: 2000,
  stage: "GRADUATED",
});
const realWake = row({
  symbol: "WAKE",
  ca: "Wake111111111111111111111111111111111111111",
  ageSec: 30 * HOUR,
  vol1hUsd: 50000,
  vol24hUsd: 100000,
  uniqueBuyers1h: 20,
  stage: "GRADUATED",
});
const washWake = row({
  symbol: "WASH",
  ca: "Wash111111111111111111111111111111111111111",
  ageSec: 30 * HOUR,
  vol1hUsd: 40000,
  uniqueBuyers1h: 3,
  stage: "GRADUATED",
});
const organicWake = row({
  symbol: "ORG",
  ca: "Org1111111111111111111111111111111111111111",
  ageSec: 30 * HOUR,
  vol1hUsd: 40000,
  uniqueBuyers1h: 20,
  stage: "GRADUATED",
});
const curve7h = row({
  symbol: "CURVE",
  ca: "Curve11111111111111111111111111111111111111",
  ageSec: 7 * HOUR,
  vol1hUsd: 20000,
  stage: "ON_CURVE",
  pad: "PUMP",
  curveFillPct: 0.8,
});
const youngWatch = row({
  symbol: "BABY",
  ca: "babyca0000000000000000000000000000000000001",
  ageSec: 600,
  vol1hUsd: 0,
  buys: 0,
  sells: 0,
  stage: "GRADUATED",
});

const def = applyFilters([ron1h, as1h, sevenH, quiet7h, tx7h, book25h, curve7h], DEFAULT_FILTERS, new Set());
const ids = def.map((r) => r.symbol);
ok(!ids.includes("RON"), "1h RON fails default 6h gate");
ok(!ids.includes("ASSE"), "1h ASSE-style fails default 6h gate");
ok(ids.includes("SEVEN"), "7h $20k/h passes default gates");
ok(!ids.includes("DEAD"), "quiet 7h dead graduate hidden by activity");
ok(!ids.includes("TXS"), "7h with 20 tx but vol under 5k hidden");
ok(ids.includes("OLD"), "25h $20k passes as BOOK candidate");
ok(!ids.includes("CURVE"), "ON_CURVE hidden on default (Curve off)");

ok(inferLane({ pad: "PUMP", stage: "GRADUATED", ageSec: 7 * HOUR, printing: true, factoryOnly: false }) === "NEW", "7h survived → NEW");
ok(inferLane({ pad: "PUMP", stage: "GRADUATED", ageSec: DAY, printing: true, factoryOnly: false }) === "BOOK", "24h survived → BOOK");
ok(computeBirth(sevenH) === true, "7h survived BIRTH allowed on NEW");
ok(computeBirth(book25h) === false, "25h never BIRTH (BOOK)");
ok(computeBirth(curve7h) === false, "raw curve never BIRTH");
ok(computeWake(sevenH) === false, "7h cannot WAKE");
ok(computeWake(dustWake) === false, "dust cannot WAKE");
ok(computeWake(realWake) === true, "24h+ with vol1h >= max(3*hourly, 25k) and 20 unique buyers WAKE");
ok(computeWake(washWake) === false, "$40k/h + 3 unique buyers is not WAKE");
ok(computeWake(organicWake) === true, "$40k/h + 20 unique buyers can WAKE");
ok(computeWake({ ...organicWake, uniqueBuyers1h: null }) === false, "missing uniqueBuyers1h skips WAKE");

const watched = applyFilters([youngWatch, ron1h], DEFAULT_FILTERS, new Set([youngWatch.ca.toLowerCase()]));
ok(watched.some((r) => r.symbol === "BABY"), "watched young/quiet still shows");
ok(!watched.some((r) => r.symbol === "RON"), "unwatched 1h still hidden when another is watched");

const early = applyFilters([ron1h], { ...DEFAULT_FILTERS, ageGate: "1h" }, new Set());
ok(early.some((r) => r.symbol === "RON"), "1h chip keeps early tape (RON 1h $20k)");

ok(!passesActivityGate(quiet7h, new Set()), "activity fails quiet graduate");
ok(passesActivityGate(sevenH, new Set()), "activity passes $20k/h");
ok(!passesActivityGate(tx7h, new Set()), "activity fails dust vol even with 20 tx");
ok(passesActivityGate(tx7h, new Set([tx7h.ca.toLowerCase()])), "watched low-vol still passes activity");
ok(passesActivityGate(youngWatch, new Set([youngWatch.ca.toLowerCase()])), "watched bypasses activity");

const laneSrc = fs.readFileSync(path.join(__dirname, "..", "src", "components", "Lane.tsx"), "utf8");
ok(laneSrc.includes("<CopyCa ca={row.ca}"), "Lane CA cell uses CopyCa");
ok(laneSrc.includes("<a href={href}") && laneSrc.includes("{row.symbol}</a>"), "token NAME keeps <a href> to desk");
ok(!/href=\{href\}[^]*CopyCa/.test(laneSrc.split("row.symbol")[0].slice(-200) + "no"), "sanity");
const caBlock = laneSrc.slice(laneSrc.indexOf("CopyCa ca={row.ca}"));
const nameBlock = laneSrc.slice(laneSrc.indexOf("<a href={href}"), laneSrc.indexOf("{row.symbol}</a>"));
ok(nameBlock.includes("<a href={href}"), "name link is the token <a>");
ok(!nameBlock.includes("CopyCa"), "CA copy is not inside the token <a>");
ok(laneSrc.indexOf("<CopyCa") > laneSrc.indexOf("{row.symbol}</a>"), "CA cell is after the token name link, not wrapping it");

const copySrc = fs.readFileSync(path.join(__dirname, "..", "src", "components", "CopyCa.tsx"), "utf8");
ok(copySrc.includes("stopPropagation"), "copy click stopPropagation");
ok(copySrc.includes("COPIED_HINT_MS"), "CopyCa uses 1000ms hint constant");
ok(copySrc.includes("copied"), "copied hint text");
ok(copySrc.includes("copyText(ca)"), "clipboard gets ca not truncated text");
ok(!/innerText/.test(copySrc), "CopyCa does not copy innerText");
ok(!copySrc.includes("copyText(display"), "CopyCa does not copy display");
ok(copySrc.includes("title=\"Copy CA\""), "title Copy CA");
ok(copySrc.includes("cursor-pointer"), "cursor pointer on CA control");
ok(copySrc.includes("preventDefault"), "copy preventDefault");

const copyLib = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "line", "copyCa.ts"), "utf8");
ok(copyLib.includes("clipboard.writeText"), "navigator.clipboard.writeText");
ok(copyLib.includes("execCommand(") && copyLib.includes("'copy'") || copyLib.includes('"copy"'), "execCommand copy fallback");

const deskSrc = fs.readFileSync(path.join(__dirname, "..", "src", "components", "TokenDesk.tsx"), "utf8");
ok(deskSrc.includes("<CopyCa ca={t.ca}"), "desk CA uses CopyCa");

const barSrc = fs.readFileSync(path.join(__dirname, "..", "src", "components", "FilterBar.tsx"), "utf8");
ok(barSrc.includes('"6h"') && barSrc.includes('"1h"') && barSrc.includes('"2h"') && barSrc.includes("any age"), "chips 1h | 2h | 6h | any age");

const apiSrc = fs.readFileSync(path.join(__dirname, "..", "src", "app", "api", "radar", "route.ts"), "utf8");
ok(apiSrc.includes("parseAgeGateParam"), "GET /api/radar uses parseAgeGateParam (default 6h)");

if (fails.length) {
  console.error("FAIL " + fails.length);
  for (const f of fails) console.error("  - " + f);
  process.exit(1);
}
console.log("all proofs passed");
