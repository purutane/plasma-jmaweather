// QML の JS ライブラリを Node から読むための足場と、最小のテストランナー。
//
// contents/code/*.js は QML 専用の `.pragma library` / `.import` を先頭に持ち、
// モジュールを export しないので Node の require では読めない。ここでその 2 行を落とし、
// トップレベルの関数と var を集めてオブジェクトとして返す。
// 製品コードをテストのために書き換えたくないので、寄せる側はこちらに閉じ込めている。

const fs = require("fs");
const path = require("path");

const CODE_DIR = path.join(__dirname, "..", "contents", "code");
const FIXTURE_DIR = path.join(__dirname, "fixtures");
// 警報・注意報は予報とは別配信なので、同じ予報区コードで別ディレクトリに置く
const WARNING_FIXTURE_DIR = path.join(FIXTURE_DIR, "warning");

function readSource(file) {
    const src = fs.readFileSync(file, "utf8");
    // `.pragma library` と `.import "Telops.js" as Telops` は JS の構文ではない
    return src.replace(/^\s*\.(pragma|import)\b.*$/gm, "");
}

// 外から渡す名前（Telops、差し替えた Date など）は関数引数として束縛する。
// 関数スコープがグローバルを覆うので、Date を渡せば製品コードの `new Date()` も
// そちらを見るようになる。
function instantiate(file, scope) {
    scope = scope || {};
    const src = readSource(file);
    const declared = [
        ...[...src.matchAll(/^function\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]),
        ...[...src.matchAll(/^var\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1])
    ];
    if (declared.length === 0) {
        throw new Error(`${path.basename(file)}: トップレベルの宣言が見つからない`);
    }
    const epilogue = "\n;return {" + declared.map((n) => `${n}: ${n}`).join(", ") + "};";
    const names = Object.keys(scope);
    const factory = new Function(...names, src + epilogue);
    return factory(...names.map((n) => scope[n]));
}

// `new Date()` だけ固定時刻を返す Date。引数付きの呼び出し（dayLabel の
// `new Date(y, m, d)` など）は素の Date と同じに振る舞う必要があるので継承で作る。
function fixedDate(iso) {
    const fixed = new Date(iso).getTime();
    if (isNaN(fixed)) {
        throw new Error(`時刻として読めない: ${iso}`);
    }
    return class FixedDate extends Date {
        constructor(...args) {
            if (args.length === 0) {
                super(fixed);
            } else {
                super(...args);
            }
        }
        static now() {
            return fixed;
        }
    };
}

function loadTelops() {
    return instantiate(path.join(CODE_DIR, "Telops.js"));
}

function loadAreas() {
    return instantiate(path.join(CODE_DIR, "Areas.js"));
}

function loadGeo() {
    return instantiate(path.join(CODE_DIR, "Geo.js"));
}

function loadLocate() {
    return instantiate(path.join(CODE_DIR, "Locate.js"));
}

function loadWarnCodes() {
    return instantiate(path.join(CODE_DIR, "WarnCodes.js"));
}

function loadWarning() {
    return instantiate(path.join(CODE_DIR, "Warning.js"), {
        WarnCodes: loadWarnCodes()
    });
}

// now を渡すと、その時刻に固定した状態の Forecast を返す（既定は実時刻）。
function loadForecast(now) {
    return instantiate(path.join(CODE_DIR, "Forecast.js"), {
        Telops: loadTelops(),
        Areas: loadAreas(),
        Date: now ? fixedDate(now) : Date
    });
}

function fixture(code, dir) {
    const file = path.join(dir || FIXTURE_DIR, `${code}.json`);
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function fixtureCodes(dir) {
    const d = dir || FIXTURE_DIR;
    if (!fs.existsSync(d)) {
        return [];
    }
    return fs
        .readdirSync(d)
        .filter((f) => /^\d{6}\.json$/.test(f))
        .map((f) => f.replace(".json", ""))
        .sort();
}

// ---- ランナー ----

const tests = [];
let current = null;

function test(name, fn) {
    tests.push({ name, fn });
}

function fail(msg) {
    throw new Error(msg);
}

function ok(cond, msg) {
    if (!cond) {
        fail(msg || "条件が満たされない");
    }
}

function eq(actual, expected, msg) {
    if (actual !== expected) {
        fail(`${msg || "値が違う"}: 期待 ${JSON.stringify(expected)} / 実際 ${JSON.stringify(actual)}`);
    }
}

function deepEq(actual, expected, msg) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) {
        fail(`${msg || "値が違う"}:\n    期待 ${e}\n    実際 ${a}`);
    }
}

// 予報データは 1 日 3 回変わるので、フィクスチャの中身に依存する検証は
// 「JSON から導いた値と一致するか」で書く。ここは補助。
function note(msg) {
    if (current) {
        current.notes.push(msg);
    }
}

async function run(filter) {
    let passed = 0;
    const failures = [];
    for (const t of tests) {
        if (filter && !t.name.includes(filter)) {
            continue;
        }
        current = { notes: [] };
        try {
            await t.fn();
            passed++;
            const extra = current.notes.length ? `  (${current.notes.join(", ")})` : "";
            console.log(`  ✓ ${t.name}${extra}`);
        } catch (e) {
            failures.push({ name: t.name, error: e });
            console.log(`  ✗ ${t.name}`);
            console.log(`      ${e.message.replace(/\n/g, "\n      ")}`);
        }
    }
    current = null;
    return { passed, failures };
}

module.exports = {
    CODE_DIR,
    FIXTURE_DIR,
    WARNING_FIXTURE_DIR,
    ROOT: path.join(__dirname, ".."),
    instantiate,
    fixedDate,
    loadTelops,
    loadAreas,
    loadGeo,
    loadLocate,
    loadWarnCodes,
    loadWarning,
    loadForecast,
    fixture,
    fixtureCodes,
    test,
    ok,
    eq,
    deepEq,
    fail,
    note,
    run,
    tests
};
