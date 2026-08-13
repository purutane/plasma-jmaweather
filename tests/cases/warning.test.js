// Warning.js（警報・注意報の解析）と WarnCodes.js（コード表）。
//
// 発表中の警報は日によって全く違うので、フィクスチャには「解析が通るか」
// 「解除が混ざらないか」だけを聞き、選別と並びの規則は合成データで固定する。
// 実際、取得した日に全国どこも警報が出ていないことは珍しくない。

const fs = require("fs");
const path = require("path");
const h = require("../harness");
const { test, ok, eq, note } = h;

const W = h.loadWarning();
const C = h.loadWarnCodes();
const areas = h.loadAreas();

// 気象庁の実データそのままの形。1 通の電文（大雨・土砂災害…）に相当する。
function telegram(areaList, opts) {
    const o = opts || {};
    return {
        reportDatetime: o.at || "2026-08-13T10:00:00+09:00",
        headlineText: o.headline || "見出しの文",
        warning: { class10Items: areaList, class20Items: [] }
    };
}

function area(code, kinds) {
    return { areaCode: code, kinds: kinds };
}

// 電文は配列で届く。1 通だけの入力を作る近道。
function doc(areaList, opts) {
    return [telegram(areaList, opts)];
}

// ---- コード表 ----

test("警報・注意報コード表の体裁", () => {
    const codes = Object.keys(C.CODES);
    ok(codes.length >= 30, `コードが ${codes.length} 件しかない`);
    const levels = [C.ADVISORY, C.WARNING, C.CRITICAL, C.EMERGENCY];
    for (const code of codes) {
        const [name, level] = C.CODES[code];
        ok(/^\d{2}$/.test(code), `コードが 2 桁でない: ${code}`);
        ok(name.length > 0, `${code}: 名称が空`);
        ok(!name.includes("レベル"), `${code}: 危険度レベルの見出しが名称に残っている (${name})`);
        ok(levels.includes(level), `${code}: 知らないレベル ${level}`);
        // レベルと語尾が食い違うと、注意報を警報として目立たせてしまう
        if (level === C.ADVISORY) {
            ok(name.endsWith("注意報"), `${code}: 注意報レベルなのに ${name}`);
        } else {
            ok(name.endsWith("警報"), `${code}: 警報レベルなのに ${name}`);
        }
    }
    note(`${codes.length} コード`);
});

test("警報・注意報コードの件数が README と一致する", () => {
    const readme = fs.readFileSync(path.join(h.ROOT, "README.md"), "utf8");
    const m = readme.match(/警報・注意報の (\d+) コード/);
    ok(m, "README に件数の記述が見つからない");
    eq(Object.keys(C.CODES).length, parseInt(m[1], 10), "警報・注意報コードの件数");
});

test("よく出るコードが表にある", () => {
    // 気象庁が長年使っているコード。生成が壊れると真っ先に消える。
    const expected = {
        "03": "大雨警報",
        "10": "大雨注意報",
        "14": "雷注意報",
        "20": "濃霧注意報",
        "33": "大雨特別警報"
    };
    for (const code of Object.keys(expected)) {
        eq(C.name(code), expected[code], `コード ${code}`);
    }
    eq(C.level("14"), C.ADVISORY, "雷注意報のレベル");
    eq(C.level("03"), C.WARNING, "大雨警報のレベル");
    eq(C.level("33"), C.EMERGENCY, "大雨特別警報のレベル");
    ok(C.ADVISORY < C.WARNING && C.WARNING < C.CRITICAL && C.CRITICAL < C.EMERGENCY,
       "レベルの大小が深刻さの順になっていない");
});

test("知らないコードは捨てずに警報として扱う", () => {
    // 気象庁がコードを増やした日に、名前が引けないからと黙って落とすと
    // 特別警報を出し損ねる。番号のまま見せる方に倒してある。
    ok(!C.known("99"), "99 は表に無い前提のテスト");
    ok(C.name("99").includes("99"), "未知コードの名称に番号が出ない");
    eq(C.level("99"), C.WARNING, "未知コードのレベル");

    const parsed = W.parse(doc([area("130010", [{ code: "99", status: "発表" }])]), "130010");
    eq(parsed.items.length, 1, "未知コードが落ちている");
    ok(W.hasWarning(parsed), "未知コードが警報として扱われていない");
});

// ---- 選別 ----

test("解除された警報は表示しない", () => {
    // 実データでは解除の方が発表中より多いことすらある
    const json = doc([
        area("130010", [
            { code: "03", status: "解除" },
            { code: "14", status: "継続" }
        ])
    ]);
    const parsed = W.parse(json, "130010");
    eq(parsed.items.length, 1, "件数");
    eq(parsed.items[0].code, "14", "残るのは継続中のもの");
    ok(!W.hasWarning(parsed), "解除された警報でパネルが点灯している");
});

test("「発表警報・注意報はなし」はコードを持たない目印として落とす", () => {
    const parsed = W.parse(doc([area("130010", [{ status: "発表警報・注意報はなし" }])]), "130010");
    ok(parsed.found, "区域が見つからない");
    eq(parsed.items.length, 0, "件数");
    eq(parsed.maxLevel, 0, "maxLevel");
    ok(!W.hasAny(parsed), "hasAny");
    eq(W.summary(parsed), "", "summary");
});

test("深刻な順に並べる", () => {
    const json = doc([
        area("130010", [
            { code: "14", status: "発表" }, // 雷注意報
            { code: "33", status: "発表" }, // 大雨特別警報
            { code: "10", status: "発表" }, // 大雨注意報
            { code: "05", status: "発表" } // 暴風警報
        ])
    ]);
    const parsed = W.parse(json, "130010");
    eq(parsed.items.map((i) => i.code).join(","), "33,05,10,14", "並び順");
    eq(parsed.maxLevel, C.EMERGENCY, "maxLevel");
    eq(W.warningNames(parsed), "大雨特別警報・暴風警報", "警報以上のまとめ");
    eq(W.advisoryNames(parsed), "大雨注意報・雷注意報", "注意報のまとめ");
    eq(W.summary(parsed), "大雨特別警報・暴風警報・大雨注意報・雷注意報", "全部のまとめ");
});

test("レベルの呼び名", () => {
    eq(W.levelLabel(C.EMERGENCY), "特別警報");
    eq(W.levelLabel(C.CRITICAL), "危険警報");
    eq(W.levelLabel(C.WARNING), "警報");
    eq(W.levelLabel(C.ADVISORY), "注意報");
});

test("見出しは一番重い電文のものを使う", () => {
    // 大雨・土砂災害・雷はそれぞれ別の電文で届き、電文ごとに違う見出しが付く。
    // 全部並べると同じ話が何度も出るので、一番重いものを伝えている文だけ出す。
    const json = [
        telegram([area("120010", [{ code: "14", status: "発表" }])], {
            headline: "雷の見出し",
            at: "2026-08-13T18:00:00+09:00"
        }),
        telegram([area("120010", [{ code: "33", status: "継続" }])], {
            headline: "大雨特別警報の見出し",
            at: "2026-08-13T21:20:00+09:00"
        })
    ];
    const parsed = W.parse(json, "120010");
    eq(parsed.headline, "大雨特別警報の見出し", "headlineText");
    // 発表時刻は電文ごとに違う。表に出すのは一番新しいもの。
    eq(parsed.reportTime, "2026-08-13T21:20:00+09:00", "reportDatetime");
});

test("複数の電文に散った警報をまとめる", () => {
    const json = [
        telegram([
            area("120010", [{ code: "33", status: "継続" }]),
            area("120020", [{ code: "43", status: "継続" }])
        ]),
        telegram([area("120010", [{ code: "49", status: "継続" }])]),
        telegram([area("120010", [{ code: "14", status: "発表" }])])
    ];
    const parsed = W.parse(json, "120010");
    eq(W.summary(parsed), "大雨特別警報・土砂災害危険警報・雷注意報", "まとめ");
    eq(parsed.maxLevel, C.EMERGENCY, "maxLevel");
    // 他の地域の分を拾っていないか
    eq(W.summary(W.parse(json, "120020")), "大雨危険警報", "別区域");
});

test("格下げの遷移は発表中として残す", () => {
    // 「警報から注意報」は解除ではなく格下げ。code は今の状態を指している。
    const json = doc([
        area("110010", [
            { code: "29", status: "警報から注意報" },
            { code: "03", status: "危険警報から警報" },
            { code: "10", status: "危険警報から注意報" }
        ])
    ]);
    const parsed = W.parse(json, "110010");
    eq(parsed.items.length, 3, "件数");
    eq(parsed.maxLevel, C.WARNING, "格下げ後のレベルで見る");
    eq(W.warningNames(parsed), "大雨警報", "警報以上");
    eq(W.advisoryNames(parsed), "大雨注意報・土砂災害注意報", "注意報");
});

// ---- 壊れた入力で落ちない ----

test("知らない区域コードは空で返す", () => {
    const parsed = W.parse(doc([area("130010", [{ code: "03", status: "発表" }])]), "999999");
    ok(!parsed.found, "found");
    eq(parsed.items.length, 0, "件数");
    ok(!W.hasWarning(parsed), "hasWarning");
});

test("空の入力で落ちない", () => {
    for (const json of [null, [], [{}], [{ warning: {} }], [null]]) {
        const parsed = W.parse(json, "130010");
        eq(parsed.items.length, 0, "件数");
        eq(parsed.maxLevel, 0, "maxLevel");
    }
    eq(W.summary(null), "", "null の summary");
    ok(!W.hasWarning(null), "null の hasWarning");
    ok(!W.hasAny(null), "null の hasAny");
});

// ---- 実データ ----

function targets(dir) {
    return h.fixtureCodes(dir).map((code) => ({ code, json: h.fixture(code, dir) }));
}

function register(dir, suffix) {
    test(`警報 JSON の区域が Areas.js の地域と一致する${suffix}`, () => {
        // 警報は予報と違って読み替えが要らない。Areas.endpoint() を通すと
        // 十勝（014030）と奄美（460040）が誰の警報も受け取れなくなる。
        let n = 0;
        for (const { code, json } of targets(dir)) {
            const office = areas.OFFICES.find((o) => o.code === code);
            ok(office, `${code}: Areas.js に無い予報区のフィクスチャ`);
            for (const a of office.areas) {
                const parsed = W.parse(json, a.code);
                ok(
                    parsed.found,
                    `${code}: ${a.name} (${a.code}) が警報 JSON に無い。` +
                        "予報区コードの扱いが間違っている可能性がある"
                );
                n++;
            }
        }
        ok(n > 0, "警報フィクスチャが無い（python3 tools/fetch_fixtures.py を実行）");
        note(`${n} 地域`);
    });

    test(`実データに知らないコードが無い${suffix}`, () => {
        const unknown = new Set();
        let total = 0;
        for (const { json } of targets(dir)) {
            for (const entry of json) {
                const w = entry.warning || {};
                for (const item of [...(w.class10Items || []), ...(w.class20Items || [])]) {
                    for (const kind of item.kinds || []) {
                        if (!kind.code) {
                            continue;
                        }
                        total++;
                        if (!C.known(kind.code)) {
                            unknown.add(kind.code);
                        }
                    }
                }
            }
        }
        ok(
            unknown.size === 0,
            `WarnCodes.js に無いコード: ${[...unknown].join(", ")}。` +
                "python3 tools/generate_data.py で取り直す"
        );
        note(`${total} 件`);
    });

    test(`実データを解析しても解除が混ざらない${suffix}`, () => {
        for (const { code, json } of targets(dir)) {
            const office = areas.OFFICES.find((o) => o.code === code);
            for (const a of office.areas) {
                const parsed = W.parse(json, a.code);
                for (const item of parsed.items) {
                    ok(item.status !== "解除", `${code}/${a.code}: 解除が残っている`);
                    ok(item.level >= C.ADVISORY, `${code}/${a.code}: レベルが無い`);
                }
                const max = parsed.items.reduce((m, i) => Math.max(m, i.level), 0);
                eq(parsed.maxLevel, max, `${code}/${a.code}: maxLevel が items と食い違う`);
            }
        }
    });
}

register(h.WARNING_FIXTURE_DIR, "");

// ---- 呼び出し側（main.qml）----

test("main.qml が警報の取得で予報区コードを読み替えていない", () => {
    // 予報は 014030→014100・460040→460100 の読み替えが要るが、警報は要らない。
    // ここで Areas.endpoint() を挟むと十勝と奄美に警報が一切出なくなる。
    const src = fs.readFileSync(path.join(h.ROOT, "contents", "ui", "main.qml"), "utf8");
    const body = src.match(/function warningUrl\(\) \{([^]*?)\n    \}/);
    ok(body, "main.qml の warningUrl() を読めない");
    ok(
        !/Areas\.endpoint/.test(body[1]),
        "warningUrl() が Areas.endpoint() を通している（十勝・奄美の警報が出なくなる）"
    );
    ok(/officeCode/.test(body[1]), "warningUrl() が予報区コードを使っていない");
    ok(
        /bosai\/warning\/data\/r8\//.test(body[1]),
        "warningUrl() が現行の配信先 (data/r8/) を指していない"
    );
    // 同名の JSON が data/warning/ にもあるが 2026-05-28 で更新が止まっている。
    // そちらへ戻すと、特別警報が出ていてもウィジェットは静かなままになる。
    ok(
        !/data\/warning\//.test(body[1]),
        "warningUrl() が更新の止まった data/warning/ を指している"
    );
});

module.exports = { register };
