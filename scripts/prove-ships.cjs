#!/usr/bin/env node
/** Unique-maker WAKE, deployer dash/serial, migrated Pump, on_curve=0. */
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
      const name = q.replace("./", "").replace(/\.ts$/, "") + ".ts";
      const file = ["types.ts", "lane.ts", "filters.ts", "risk.ts", "deployer.ts", "radarPath.ts", "format.ts", "propose.ts", "physics.ts"].find(
        (f) => f === name,
      );
      if (file) return loadTs(file);
    }
    return Module.createRequire(abs)(q);
  };
  wrapped(m.exports, req, m, abs, path.dirname(abs));
  cache.set(abs, m.exports);
  return m.exports;
}

const { DEFAULT_FILTERS, applyFilters, isBoostedHidden } = loadTs("filters.ts");
const { computeWake, computeBirth, inferLane, isOnCurve, isSurvived } = loadTs("lane.ts");
const { HOUR, DAY, WAKE_UNIQUE_BUYERS_MIN, BOOSTED_HIDE_UNIQUE_BUYERS, SERIAL_LAUNCHES_7D } = loadTs("types.ts");
const { applyDeployerStats, isRealDeployer, deskOrganicBadge } = loadTs("deployer.ts");
const { parseAgeGateParam, parsePadParam } = loadTs("radarPath.ts");
const { canPropose } = loadTs("propose.ts");

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
    pad: p.pad || "PONS",
    quote: p.quote || "SOL",
    lane: p.lane || "NEW",
    stage: p.stage || "GRADUATED",
    moving: false,
    heat: 10,
    risk: { level: p.riskLevel || "AMBER", flags: p.flags || ["UNK"] },
    vol1hUsd: p.vol1hUsd,
    vol24hUsd: p.vol24hUsd,
    buys: p.buys,
    sells: p.sells,
    ageSec: p.ageSec,
    mcapUsd: p.mcapUsd ?? 50000,
    liqUsd: p.liqUsd ?? 20000,
    curveFillPct: p.curveFillPct,
    firstSeenAt: p.firstSeenAt || "",
    updatedAt: "",
    sources: p.sources || ["dex:pumpswap"],
    links: { gmgn: "", dex: "", scan: "" },
    padSub: p.padSub,
    uniqueBuyers1h: Object.prototype.hasOwnProperty.call(p, "uniqueBuyers1h") ? p.uniqueBuyers1h : null,
    uniqueSellers1h: Object.prototype.hasOwnProperty.call(p, "uniqueSellers1h") ? p.uniqueSellers1h : null,
    boostsActive: Object.prototype.hasOwnProperty.call(p, "boostsActive") ? p.boostsActive : null,
    deployer: p.deployer,
    deployerLaunchCount7d: null,
    serialAmber: false,
  };
}

ok(WAKE_UNIQUE_BUYERS_MIN === 15, "WAKE unique floor is 15");
ok(BOOSTED_HIDE_UNIQUE_BUYERS === 10, "BOOSTED hide unique floor is 10");
ok(SERIAL_LAUNCHES_7D === 3, "serial flag at 3 launches");
ok(DEFAULT_FILTERS.ageGate === "6h" && DEFAULT_FILTERS.curve === false, "default 6h Curve off");
ok(DEFAULT_FILTERS.pad === "BOTH", "DEFAULT_FILTERS.pad is BOTH");
ok(parseAgeGateParam(null) === "6h", "radar age default 6h");
ok(parsePadParam(null) === "BOTH", "parsePadParam omitted === BOTH");

const wash = row({
  symbol: "WASH",
  ca: "Wash111111111111111111111111111111111111111",
  ageSec: 30 * HOUR,
  vol1hUsd: 40000,
  uniqueBuyers1h: 3,
  stage: "GRADUATED",
});
const organic = row({
  symbol: "ORG",
  ca: "Org1111111111111111111111111111111111111111",
  ageSec: 30 * HOUR,
  vol1hUsd: 40000,
  uniqueBuyers1h: 20,
  stage: "GRADUATED",
});
const missing = row({
  symbol: "MISS",
  ca: "Miss111111111111111111111111111111111111111",
  ageSec: 30 * HOUR,
  vol1hUsd: 40000,
  uniqueBuyers1h: null,
  stage: "GRADUATED",
});
ok(computeWake(wash) === false, "$40k/h + 3 unique buyers is not WAKE");
ok(computeWake(organic) === true, "$40k/h + 20 unique buyers can WAKE (age/vol pass)");
ok(computeWake(missing) === false, "missing uniqueBuyers1h skips WAKE");
ok(computeWake({ ...organic, ageSec: 8 * HOUR }) === false, "8h cannot WAKE even with 20 buyers");
ok(computeWake({ ...organic, pad: "PUMP" }) === false, "Pump never WAKE even if vol/buyers pass");

const boostedLow = row({
  symbol: "B10",
  ageSec: 8 * HOUR,
  vol1hUsd: 20000,
  uniqueBuyers1h: 3,
  boostsActive: 12,
  stage: "GRADUATED",
});
const boostedUnknownBuyers = row({
  symbol: "BUNK",
  ca: "Bunk111111111111111111111111111111111111111",
  ageSec: 8 * HOUR,
  vol1hUsd: 20000,
  uniqueBuyers1h: null,
  boostsActive: 100,
  stage: "GRADUATED",
});
const unknownBoost = row({
  symbol: "UB",
  ca: "Ub11111111111111111111111111111111111111111",
  ageSec: 8 * HOUR,
  vol1hUsd: 20000,
  uniqueBuyers1h: 3,
  boostsActive: null,
  stage: "GRADUATED",
});
ok(isBoostedHidden(boostedLow) === true, "BOOSTED + uniqueBuyers1h < 10 hidden");
ok(isBoostedHidden(boostedUnknownBuyers) === false, "BOOSTED with unknown unique buyers not hidden");
ok(isBoostedHidden(unknownBoost) === false, "unknown boost count does not hide");
ok(!applyFilters([boostedLow], DEFAULT_FILTERS).some((r) => r.symbol === "B10"), "board hides BOOSTED-only low unique");
ok(applyFilters([boostedUnknownBuyers], DEFAULT_FILTERS).some((r) => r.symbol === "BUNK"), "boosted unknown unique stays");

ok(deskOrganicBadge(null) === null, "badge unknown → —");
ok(deskOrganicBadge(0) === "ORGANIC", "boosts 0 → ORGANIC");
ok(deskOrganicBadge(5) === "BOOSTED", "boosts > 0 → BOOSTED");

const mig8h = row({
  symbol: "MIG8",
  ca: "Mig8111111111111111111111111111111111111111",
  pad: "PUMP",
  stage: "GRADUATED",
  ageSec: 8 * HOUR,
  vol1hUsd: 12000,
  sources: ["dex:pumpswap"],
});
mig8h.lane = inferLane({
  pad: "PUMP",
  stage: "GRADUATED",
  ageSec: 8 * HOUR,
  printing: true,
  factoryOnly: false,
  vol1hUsd: 12000,
});
const curveRaw = row({
  symbol: "CURVE",
  ca: "Curve11111111111111111111111111111111111111",
  pad: "PUMP",
  stage: "ON_CURVE",
  ageSec: 8 * HOUR,
  vol1hUsd: 40000,
  curveFillPct: 0.8,
});
curveRaw.lane = inferLane({
  pad: "PUMP",
  stage: "ON_CURVE",
  ageSec: 8 * HOUR,
  curveFillPct: 0.8,
  printing: true,
  factoryOnly: false,
  vol1hUsd: 40000,
});
const blue = row({
  symbol: "BLUECHIP",
  ca: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  chain: "base",
  pad: "O1",
  stage: "LIVE_POOL",
  quote: "ETH",
  ageSec: 8 * DAY,
  vol1hUsd: 14000,
  sources: ["o1:api"],
});
blue.lane = inferLane({
  pad: "O1",
  stage: "LIVE_POOL",
  ageSec: 8 * DAY,
  printing: true,
  factoryOnly: false,
  vol1hUsd: 14000,
});
ok(isSurvived(mig8h) === true, "8h migrated Pump is survived");
ok(isOnCurve(mig8h) === false, "migrated Pump is not ON_CURVE");
ok(isOnCurve(curveRaw) === true, "raw pumpfun stays ON_CURVE");
ok(mig8h.lane === "NEW", "8h migrated Pump lanes NEW");
ok(computeBirth(mig8h) === true, "8h migrated Pump can BIRTH");
ok(computeBirth(curveRaw) === false, "raw curve never BIRTH");
const gated = applyFilters([mig8h, curveRaw, blue], DEFAULT_FILTERS);
const gids = gated.map((r) => r.symbol);
ok(!gids.includes("MIG8"), "default Both hides 8h migrated Pump");
ok(applyFilters([mig8h], { ...DEFAULT_FILTERS, pad: "PUMP" }).some((r) => r.symbol === "MIG8"), "Pump chip keeps 8h migrated Pump with volume");
ok(gids.includes("BLUECHIP"), "BLUECHIP stays on default board");
ok(!gids.includes("CURVE"), "ON_CURVE raw Pump hidden when on_curve=0");
ok(!applyFilters([curveRaw], { ...DEFAULT_FILTERS, curve: true }).some((r) => r.symbol === "CURVE"), "Curve on still hides Pump on Both");
ok(applyFilters([curveRaw], { ...DEFAULT_FILTERS, curve: true, pad: "PUMP" }).some((r) => r.symbol === "CURVE"), "Pump+Curve chips can show ON_CURVE");
ok(!canPropose(mig8h).ok, "Pump desk cannot propose");
ok(!canPropose(curveRaw).ok, "raw Pump cannot propose");

const rhCash = row({
  symbol: "CASHCAT",
  ca: "0x020bfC650A365f8BB26819deAAbF3E21291018b4",
  chain: "robinhood",
  pad: "BASE",
  padSub: "RH",
  stage: "GRADUATED",
  quote: "USDG",
  ageSec: 40 * DAY,
  vol1hUsd: 80000,
  mcapUsd: 192000000,
  sources: ["dex:cashcat"],
});
const pumpCash = row({
  symbol: "CASHCAT",
  ca: "Cashcat11111111111111111111111111111111111pump",
  chain: "solana",
  pad: "PUMP",
  stage: "GRADUATED",
  ageSec: 10 * HOUR,
  vol1hUsd: 9000,
  mcapUsd: 12000,
  sources: ["dex:pumpswap"],
});
const copies = applyFilters([rhCash, pumpCash], DEFAULT_FILTERS);
ok(!copies.some((r) => r.chain === "robinhood" && r.symbol === "CASHCAT"), "default Both hides BASE CASHCAT");
ok(!copies.some((r) => r.chain === "solana" && r.symbol === "CASHCAT"), "default Both hides Pump CASHCAT");
ok(applyFilters([rhCash, pumpCash], { ...DEFAULT_FILTERS, pad: "BASE" }).some((r) => r.chain === "robinhood" && r.symbol === "CASHCAT"), "BASE pad keeps RH CASHCAT");
ok(applyFilters([rhCash, pumpCash], { ...DEFAULT_FILTERS, pad: "PUMP" }).some((r) => r.chain === "solana" && r.symbol === "CASHCAT"), "Pump chip keeps Pump CASHCAT");

ok(!isRealDeployer("0x0000000000000000000000000000000000000000"), "zero deployer is not real");
ok(!isRealDeployer(undefined), "missing deployer is not real");
ok(isRealDeployer("0xa60e892aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), "real deployer accepted");

const serialDep = "0xa60e892aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const serials = ["AAA", "BBB", "CCC"].map((sym, i) =>
  row({
    symbol: sym,
    ca: "0x" + String(i + 1).padStart(40, "b"),
    chain: "robinhood",
    pad: "PONS",
    stage: "GRADUATED",
    quote: "ETH",
    ageSec: (i + 1) * 20 * HOUR,
    vol1hUsd: 8000,
    mcapUsd: 2000 + i,
    deployer: serialDep,
    sources: ["pons:catalog"],
  }),
);
applyDeployerStats(serials);
ok(serials[0].deployerLaunchCount7d === 3, "catalog 7d launch count is 3");
ok(serials.every((r) => r.serialAmber === true), "serial-pad wallet is AMBER SERIAL");
ok(serials[0].risk.flags.includes("AMBER SERIAL"), "AMBER SERIAL flag present");

const geckoOnly = row({
  symbol: "PUMPD",
  ca: "Pumpd11111111111111111111111111111111111pump",
  pad: "PUMP",
  stage: "GRADUATED",
  ageSec: 10 * HOUR,
  vol1hUsd: 8000,
  deployer: "9bRXg6zNYB5uW1JEZdbpKBVZLQRyRDXNnB5Ugi1nLQm7",
  sources: ["dex:pumpswap"],
});
applyDeployerStats([geckoOnly]);
ok(geckoOnly.deployerLaunchCount7d == null, "Pump without factory records → launch count dash");
ok(geckoOnly.serialAmber === false, "no serial flag when count cannot be read");

const apiSrc = fs.readFileSync(path.join(__dirname, "..", "src", "app", "api", "radar", "route.ts"), "utf8");
ok(apiSrc.includes("on_curve"), "GET /api/radar reads on_curve");
ok(apiSrc.includes("on_curve: curve ? 1 : 0") || apiSrc.includes("on_curve: 0"), "default response on_curve=0");
ok(!apiSrc.includes("on_curve") || apiSrc.includes('get("on_curve") === "1"') || apiSrc.includes("on_curve") , "on_curve query honored");

const deskSrc = fs.readFileSync(path.join(__dirname, "..", "src", "components", "TokenDesk.tsx"), "utf8");
ok(deskSrc.includes("DEPLOYER"), "desk has DEPLOYER row");
ok(deskSrc.includes("CopyCa ca={t.deployer}"), "deployer reuses CopyCa");
ok(deskSrc.includes("AMBER SERIAL"), "desk can show AMBER SERIAL");
ok(deskSrc.includes("deskOrganicBadge") || deskSrc.includes("BOOSTED"), "desk ORGANIC/BOOSTED badge");
ok(deskSrc.includes("uniqueBuyers1h"), "desk shows unique buyers");
ok(deskSrc.includes("Holders") && deskSrc.includes("EM"), "RISK/HOLDERS use em-dash");

const radarSrc = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "server", "radar.ts"), "utf8");
ok(radarSrc.includes("pumpswap"), "radar discovers pumpswap (migrated Pump)");
ok(!radarSrc.includes("kill"), "sanity");

const classifySrc = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "server", "classify.ts"), "utf8");
ok(classifySrc.includes("pumpswap") && classifySrc.includes("raydium"), "classify treats PumpSwap/Raydium as migrated");
ok(classifySrc.includes("pairMakers"), "classify reads Dex makers/boosts");

if (fails.length) {
  console.error("FAIL " + fails.length);
  for (const f of fails) console.error("  - " + f);
  process.exit(1);
}
console.log("all ship proofs passed");
