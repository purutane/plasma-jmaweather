// Telops.js も生成物。天気コードが増えたときに落ちるようにしておく。
// アイコン名は Breeze のもので、実在するかは QML を動かすまで分からないため、
// ここでは名前の付け方と夜アイコンの対応だけを見る。

const fs = require("fs");
const path = require("path");
const h = require("../harness");
const { test, ok, eq } = h;

const telops = h.loadTelops();
const README = fs.readFileSync(path.join(h.ROOT, "README.md"), "utf8");
const CODES = Object.keys(telops.TELOPS);

test("天気コードの件数が README と一致する", () => {
    const m = README.match(/気象庁の (\d+) コード/);
    ok(m, "README に件数の記述が見つからない");
    eq(CODES.length, parseInt(m[1], 10), "天気コードの件数");
    h.note(`${CODES.length} コード`);
});

test("全コードにアイコンとラベルが揃っている", () => {
    for (const code of CODES) {
        const [icon, label] = telops.TELOPS[code];
        ok(/^\d{3}$/.test(code), `コードの形式: ${code}`);
        ok(
            icon.startsWith("weather-"),
            `${code}: アイコン名が weather- で始まらない (${icon})`
        );
        ok(label && label.length > 0, `${code}: ラベルが空`);
        eq(telops.icon(code, false), icon, `icon(${code})`);
        eq(telops.label(code), label, `label(${code})`);
        // QML からは数値で渡ることもある
        eq(telops.icon(Number(code), false), icon, `icon(${code}) 数値`);
    }
});

test("昼専用アイコンには必ず夜の対応がある", () => {
    const dayOnly = new Set(
        CODES.map((c) => telops.TELOPS[c][0]).filter((i) => i.endsWith("-day"))
    );
    for (const icon of dayOnly) {
        ok(telops.NIGHT[icon], `${icon} に夜アイコンの対応が無い（夜に太陽が出る）`);
    }
    h.note(`昼専用 ${dayOnly.size} 種`);
});

test("夜アイコンの対応表に使われていない項目が無い", () => {
    const used = new Set(CODES.map((c) => telops.TELOPS[c][0]));
    for (const icon of Object.keys(telops.NIGHT)) {
        ok(used.has(icon), `NIGHT の ${icon} はどのコードからも参照されていない`);
        ok(
            telops.NIGHT[icon].endsWith("-night"),
            `${icon} の対応先が -night で終わらない (${telops.NIGHT[icon]})`
        );
    }
});

test("夜は夜アイコン、対応が無ければ昼のまま", () => {
    eq(telops.icon("100", true), "weather-clear-night", "晴");
    eq(telops.icon("101", true), "weather-few-clouds-night", "晴時々曇");
    // 曇や雨は昼夜で絵が変わらないので据え置き
    eq(telops.icon("200", true), "weather-many-clouds", "曇");
    eq(telops.icon("300", true), "weather-showers", "雨");
    for (const code of CODES) {
        const night = telops.icon(code, true);
        ok(
            !night.endsWith("-day"),
            `${code}: 夜なのに昼アイコン (${night})`
        );
    }
});

test("知らないコードは既定のアイコンとダッシュ", () => {
    for (const bad of ["999", "", null, undefined, "abc"]) {
        eq(telops.icon(bad, false), "weather-none-available", `icon(${bad})`);
        eq(telops.icon(bad, true), "weather-none-available", `icon(${bad}, night)`);
        eq(telops.label(bad), "--", `label(${bad})`);
    }
});
