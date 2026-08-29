#!/usr/bin/env node
/** Unit: CopyCa copies full 0x CA, never truncated/ellipsis display. */
const ts = require("typescript");
const fs = require("fs");
const path = require("path");
const Module = require("module");

const root = path.join(__dirname, "..", "src", "lib", "line");

function loadTs(rel) {
  const abs = path.join(root, rel);
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
  const req = (q) => Module.createRequire(abs)(q);
  wrapped(m.exports, req, m, abs, path.dirname(abs));
  return m.exports;
}

const fails = [];
function ok(cond, msg) {
  if (!cond) fails.push(msg);
  else console.log("ok  " + msg);
}

const { shortCa } = loadTs("format.ts");
const { copyText, COPIED_HINT_MS } = loadTs("copyCa.ts");

const MEGA = "0x70f3a6a1ecddefe558e2e5adb35b09c69bdc03fb";
const truncated = shortCa(MEGA);

ok(COPIED_HINT_MS === 1000, "COPIED_HINT_MS=1000");
ok(MEGA.length === 42, "EVM ca length 42");
ok(truncated !== MEGA, "shortCa truncates display");
ok(truncated.includes("...") || truncated.includes("\u2026"), "display uses ellipsis");
ok(!MEGA.includes("...") && !MEGA.includes("\u2026"), "raw ca has no ellipsis");

const writes = [];
const execs = [];
global.navigator = {
  clipboard: {
    writeText: (t) => {
      writes.push(t);
      return Promise.resolve();
    },
  },
};
global.document = {
  createElement: (tag) => {
    const el = { tagName: tag, value: "", style: {}, setAttribute() {}, focus() {}, select() { execs.push(el.value); } };
    return el;
  },
  body: { appendChild() {}, removeChild() {} },
  execCommand: () => true,
};

// CopyCa onCopy does copyText(ca) with the raw field, never display/innerText.
copyText(MEGA);
ok(writes.length === 1, "writeText called once");
ok(writes[0] === MEGA, "writeText received full ca");
ok(writes[0].length === 42, "copied string length 42");
ok(!writes[0].includes("...") && !writes[0].includes("\u2026"), "copied string has no ellipsis");
ok(writes[0] !== truncated, "did not copy truncated display");

const copySrc = fs.readFileSync(path.join(__dirname, "..", "src", "components", "CopyCa.tsx"), "utf8");
ok(copySrc.includes("copyText(ca)"), "CopyCa passes ca into copyText");
ok(!/innerText|textContent/.test(copySrc), "CopyCa does not read innerText/textContent");
ok(copySrc.includes("title=\"Copy CA\""), "title Copy CA");
ok(copySrc.includes("cursor-pointer"), "cursor-pointer");

const laneSrc = fs.readFileSync(path.join(__dirname, "..", "src", "components", "Lane.tsx"), "utf8");
ok(laneSrc.includes("<CopyCa ca={row.ca}"), "radar CA cell passes row.ca");
ok(laneSrc.includes("<a href={href}") && laneSrc.includes("{row.symbol}</a>"), "token NAME is the desk <a>");
ok(laneSrc.indexOf("<CopyCa") > laneSrc.indexOf("{row.symbol}</a>"), "CA cell is not inside the name <a>");

const deskSrc = fs.readFileSync(path.join(__dirname, "..", "src", "components", "TokenDesk.tsx"), "utf8");
ok(deskSrc.includes("<CopyCa ca={t.ca}"), "desk passes t.ca");

if (fails.length) {
  console.error("FAIL " + fails.length);
  for (const f of fails) console.error("  - " + f);
  process.exit(1);
}
console.log("copy-ca proofs passed");
