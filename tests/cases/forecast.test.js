// Forecast.js の解析ロジック。README「実装メモ」に書いてある引っかかりどころを
// 実データで固定するのが目的。
//
// 予報の中身は 1 日 3 回変わるので、期待値は原則 JSON から導いて比べる。
// 「29 度」のような具体値を書くとフィクスチャを取り直すたびに落ちる。

const h = require("../harness");
const { test, ok, eq, deepEq, note } = h;

const areas = h.loadAreas();

// 予報区コード -> その予報区に属する地域（配信コードでまとめる）
function areasFor(endpoint) {
    const out = [];
    for (const office of areas.OFFICES) {
        if (areas.endpoint(office.code) !== endpoint) {
            continue;
        }
        for (const a of office.areas) {
            out.push({ officeCode: office.code, code: a.code, name: a.name });
        }
    }
    return out;
}

function codesOf(ts) {
    return ts.areas.map((a) => a.area.code);
}

function reportDate(json) {
    return json[0].reportDatetime.substring(0, 10);
}

// テスト対象のフィクスチャ一式（--all を付けると tests/fixtures/all/ を見る）
function targets(dir) {
    return h.fixtureCodes(dir).map((code) => ({ code, json: h.fixture(code, dir) }));
}

function eachArea(dir, fn) {
    let n = 0;
    for (const { code, json } of targets(dir)) {
        for (const area of areasFor(code)) {
            fn(area, json, code);
            n++;
        }
    }
    ok(n > 0, "フィクスチャが無い（python3 tools/fetch_fixtures.py を実行）");
    note(`${n} 地域`);
}

function register(dir, suffix) {
    // ---- 受け皿（週間予報の区域が短期より粗い問題）----

    test(`受け皿は予報区ごとに高々 1 つ${suffix}`, () => {
        for (const { code, json } of targets(dir)) {
            if (json.length < 2) {
                continue;
            }
            const shortCodes = codesOf(json[0].timeSeries[0]);
            const weekCodes = codesOf(json[1].timeSeries[0]);
            const catchAll = weekCodes.filter((c) => !shortCodes.includes(c));
            ok(
                catchAll.length <= 1,
                `${code}: 受け皿候補が ${catchAll.length} 件ある (${catchAll.join(", ")})。` +
                    "resolveWeekIndex は一意を前提にしているので実装の見直しが必要"
            );
            // 短期にしか無い区域があるなら、それを受け止める側が必ず要る
            const needsCatchAll = shortCodes.some((c) => !weekCodes.includes(c));
            if (needsCatchAll) {
                eq(catchAll.length, 1, `${code}: 受け皿が必要なのに見つからない`);
            }
        }
    });

    test(`全地域で天気コードとラベルが引ける${suffix}`, () => {
        eachArea(dir, (area, json, code) => {
            const parsed = h.loadForecast().parse(json, area.code);
            const jsonName = json[0].timeSeries[0].areas.find(
                (a) => a.area.code === area.code
            );
            ok(jsonName, `${code}/${area.code}: 短期予報に区域が無い`);
            eq(parsed.areaName, jsonName.area.name, `${code}/${area.code}: 区域名`);
            ok(parsed.order.length > 0, `${code}/${area.code}: 日付が空`);

            for (const date of parsed.order) {
                const day = parsed.days[date];
                if (day.code === null) {
                    continue;
                }
                ok(
                    day.label && day.label !== "--",
                    `${code}/${area.code} ${date}: 天気コード ${day.code} のラベルが引けない`
                );
            }
        });
    });

    // ---- 気温（観測所単位で配信される問題）----

    // 短期の気温は気象庁の対応表（forecast_area.json 由来）で区域から直に引く。
    // 週間側から逆算していた頃は、142 地域中 78 で別の場所の気温を出していた。
    test(`短期の気温は対応表の観測所から引く${suffix}`, () => {
        eachArea(dir, (area, json, code) => {
            const cands = areas.stationsOf(area.code);
            ok(cands.length > 0, `${code}/${area.code}: 対応表に観測所が無い`);

            const stations = codesOf(json[0].timeSeries[2]);
            const expected = cands.find((c) => stations.includes(c));
            ok(
                expected,
                `${code}/${area.code}: 対応表の観測所 ${cands.join(",")} が短期の気温系列に無い。` +
                    "予備の週間側に落ちて別の場所の気温を拾う"
            );

            const parsed = h.loadForecast().parse(json, area.code);
            eq(parsed.stationCode, expected, `${code}/${area.code}: 観測所`);
        });
    });

    test(`週間の気温は週間側の観測所から引く${suffix}`, () => {
        eachArea(dir, (area, json, code) => {
            if (json.length < 2 || json[1].timeSeries.length < 2) {
                return;
            }
            const parsed = h.loadForecast().parse(json, area.code);
            const weekStations = codesOf(json[1].timeSeries[1]);
            ok(
                weekStations.includes(parsed.weekStationCode),
                `${code}/${area.code}: 週間の観測所 ${parsed.weekStationCode} が週間予報側に無い`
            );
        });
    });

    test(`最初の 1 日を除き気温が埋まる${suffix}`, () => {
        eachArea(dir, (area, json, code) => {
            const parsed = h.loadForecast().parse(json, area.code);
            // 17 時発表では今日の気温が配信対象から外れるので、先頭日だけは空を許す
            for (const date of parsed.order.slice(1)) {
                const day = parsed.days[date];
                ok(
                    day.tmax !== null,
                    `${code}/${area.code} ${date}: 最高気温が空`
                );
                ok(
                    day.tmin !== null,
                    `${code}/${area.code} ${date}: 最低気温が空`
                );
                ok(
                    day.tmax >= day.tmin,
                    `${code}/${area.code} ${date}: 最高 ${day.tmax} < 最低 ${day.tmin}`
                );
            }
        });
    });

    // 5時・11時発表では今日の枠が [09時, 00時] の逆順で並び、後ろの00時に最高気温と
    // 同じ値が入って届く。コミットしているフィクスチャは 17時発表なので普段は素通りするが、
    // 取り直した時刻によっては効く。
    test(`逆順に並んだ00時は最低気温として読まない${suffix}`, () => {
        let seen = 0;
        eachArea(dir, (area, json, code) => {
            const ts2 = json[0].timeSeries[2];
            const parsed = h.loadForecast().parse(json, area.code);
            const maxAt = {};
            ts2.timeDefines.forEach((t, i) => {
                const date = t.substring(0, 10);
                if (t.substring(11, 13) !== "00") {
                    maxAt[date] = i;
                    return;
                }
                if (maxAt[date] === undefined) {
                    return;
                }
                seen++;
                eq(
                    parsed.days[date].tmin,
                    null,
                    `${code}/${area.code} ${date}: 最高気温 ${parsed.days[date].tmax} の写しを最低として読んでいる`
                );
            });
        });
        note(seen > 0 ? `${seen} 件が逆順` : "逆順の並びは無し（17時発表）");
    });

    test(`降水確率はその日の最大値を代表にする${suffix}`, () => {
        eachArea(dir, (area, json, code) => {
            const parsed = h.loadForecast().parse(json, area.code);
            const byDate = {};
            for (const p of parsed.pops6h) {
                byDate[p.date] = Math.max(byDate[p.date] ?? -1, p.value);
            }
            for (const [date, expected] of Object.entries(byDate)) {
                eq(parsed.days[date].pop, expected, `${code}/${area.code} ${date}: 代表の降水確率`);
            }
            for (const p of parsed.pops6h) {
                ok(
                    p.value >= 0 && p.value <= 100,
                    `${code}/${area.code}: 降水確率が範囲外 ${p.value}`
                );
            }
        });
    });

    test(`order は日付昇順で days と一致する${suffix}`, () => {
        eachArea(dir, (area, json, code) => {
            const parsed = h.loadForecast().parse(json, area.code);
            const sorted = [...parsed.order].sort();
            deepEq(parsed.order, sorted, `${code}/${area.code}: order が昇順でない`);
            deepEq(
                [...parsed.order].sort(),
                Object.keys(parsed.days).sort(),
                `${code}/${area.code}: order と days が食い違う`
            );
        });
    });
}

register(undefined, "");

// 週間側のどの区域に寄るかを固定する。README が挙げている
// 「並び順だと別地域を拾う 5 箇所」を名指しで押さえておく。
//
// 観測所は寄せ先の週間区域から決まるので、週間側の観測所名を見れば寄せ先が分かる
// （短期の観測所は対応表から引くので、寄せ先の証拠にはならない）。
// 区域の再編があれば落ちるが、そのときは実際に確認し直すべきなので落ちてよい。
const WEEK_STATION = [
    ["014100", "014010", "根室地方", "釧路", "釧路・根室地方へ寄せる（並び順だと帯広を拾う）"],
    ["014100", "014020", "釧路地方", "釧路", ""],
    ["014100", "014030", "十勝地方", "帯広", "週間にも同じコードがあるので寄せない"],
    ["070000", "070010", "中通り", "福島", "中通り・浜通りへ寄せる"],
    ["070000", "070020", "浜通り", "福島", "中通り・浜通りへ寄せる（並び順だと若松を拾う）"],
    ["070000", "070030", "会津", "若松", "週間にも同じコードがある"],
    ["130000", "130010", "東京地方", "東京", ""],
    ["130000", "130020", "伊豆諸島北部", "八丈島", "伊豆諸島へ寄せる"],
    ["130000", "130030", "伊豆諸島南部", "八丈島", "伊豆諸島へ寄せる（並び順だと父島を拾う）"],
    ["130000", "130040", "小笠原諸島", "父島", "週間にも同じコードがある"],
    ["270000", "270000", "大阪府", "大阪", "予報区に区域が 1 つだけ"],
    ["460100", "460010", "薩摩地方", "鹿児島", "鹿児島県（奄美地方除く）へ寄せる"],
    ["460100", "460020", "大隅地方", "鹿児島", "同上（並び順だと名瀬を拾う）"],
    ["460100", "460030", "種子島・屋久島地方", "鹿児島", "同上（並び順だと名瀬を拾う）"],
    ["460100", "460040", "奄美地方", "名瀬", "週間にも同じコードがある"]
];

test("週間予報の寄せ先が地域ごとに正しい", () => {
    const F = h.loadForecast();
    for (const [office, code, name, station, why] of WEEK_STATION) {
        const parsed = F.parse(h.fixture(office), code);
        eq(parsed.areaName, name, `${office}/${code}: 区域名`);
        eq(
            parsed.weekStationName,
            station,
            `${name} の週間側の観測所${why ? "（" + why + "）" : ""}`
        );
    }
    note(`${WEEK_STATION.length} 地域`);
});

// ---- 今日の最低気温（発表時刻で並びが変わる問題）----
//
// コミットしているフィクスチャは 17時発表なので、5時・11時発表の並びが入らない。
// 実データで確認した形（11時発表の全 56 配信・171 観測所で同じ）を合成データで固定する。

function tempsOnly(timeDefines, temps) {
    return [
        {
            reportDatetime: timeDefines[0],
            publishingOffice: "気象庁",
            timeSeries: [
                {
                    timeDefines: [timeDefines[0]],
                    areas: [
                        {
                            area: { name: "東京地方", code: "130010" },
                            weatherCodes: ["100"],
                            weathers: ["晴れ"],
                            winds: ["北の風"]
                        }
                    ]
                },
                {
                    timeDefines: [],
                    areas: [{ area: { name: "東京地方", code: "130010" }, pops: [] }]
                },
                {
                    timeDefines: timeDefines,
                    areas: [{ area: { name: "東京", code: "44132" }, temps: temps }]
                }
            ]
        }
    ];
}

// 5時・11時発表の形（今日の枠が逆順で、00時に最高気温の写しが入る）
const REVERSED = [
    [
        "2026-08-14T09:00:00+09:00",
        "2026-08-14T00:00:00+09:00",
        "2026-08-15T00:00:00+09:00",
        "2026-08-15T09:00:00+09:00"
    ],
    ["29", "29", "23", "30"]
];

test("11時発表では今日の最低気温を空にする", () => {
    const parsed = h
        .loadForecast("2026-08-14T11:30:00+09:00")
        .parse(tempsOnly(...REVERSED), "130010");
    eq(parsed.days["2026-08-14"].tmax, 29, "今日の最高");
    eq(parsed.days["2026-08-14"].tmin, null, "今日の最低（最高の写しなので読まない）");
    eq(parsed.days["2026-08-15"].tmin, 23, "明日の最低");
    eq(parsed.days["2026-08-15"].tmax, 30, "明日の最高");
});

test("17時発表の素直な並びはそのまま読む", () => {
    const json = tempsOnly(
        ["2026-08-15T00:00:00+09:00", "2026-08-15T09:00:00+09:00"],
        ["23", "30"]
    );
    const parsed = h.loadForecast("2026-08-14T18:00:00+09:00").parse(json, "130010");
    eq(parsed.days["2026-08-15"].tmin, 23, "最低");
    eq(parsed.days["2026-08-15"].tmax, 30, "最高");
});

test("最高と同値でも順番どおりの00時なら最低として読む", () => {
    // 冬日には本当に最高＝最低が起こる。「同値なら捨てる」で判定してはいけない
    const json = tempsOnly(
        ["2026-01-15T00:00:00+09:00", "2026-01-15T09:00:00+09:00"],
        ["-2", "-2"]
    );
    const parsed = h.loadForecast("2026-01-14T18:00:00+09:00").parse(json, "130010");
    eq(parsed.days["2026-01-15"].tmin, -2, "最低");
    eq(parsed.days["2026-01-15"].tmax, -2, "最高");
});

// ---- 今日の最低気温の持ち越し ----

// 翌日の分（08-15 の最低 23）が配信に入っている状態
const TOMORROW = () => {
    const F = h.loadForecast("2026-08-14T11:30:00+09:00");
    return { F, parsed: F.parse(tempsOnly(...REVERSED), "130010") };
};

// 翌日になり、今日（08-15）の最低が配信から消えた状態
const NEXT_DAY = [
    [
        "2026-08-15T09:00:00+09:00",
        "2026-08-15T00:00:00+09:00",
        "2026-08-16T00:00:00+09:00",
        "2026-08-16T09:00:00+09:00"
    ],
    ["30", "30", "24", "31"]
];

test("先の日の最低気温を控える", () => {
    const { F, parsed } = TOMORROW();
    deepEq(
        F.carriedFrom(parsed, { station: "", mins: "" }),
        { station: "44132", mins: "2026-08-15=23" },
        "控える内容"
    );
});

test("控えた値を翌日の今日に当てはめる", () => {
    // 前日に控えた 23 を、日付が変わったあとの「今日」に使う
    const F = h.loadForecast("2026-08-15T11:30:00+09:00");
    const parsed = F.parse(tempsOnly(...NEXT_DAY), "130010");
    eq(parsed.days["2026-08-15"].tmin, null, "配信には今日の最低が無い");

    const saved = { station: "44132", mins: "2026-08-15=23" };
    eq(F.applyCarriedMin(parsed, saved), true, "当てはめた");
    eq(parsed.days["2026-08-15"].tmin, 23, "持ち越した最低");
    eq(parsed.days["2026-08-15"].tminCarried, true, "持ち越しの印");
    eq(F.tempPairText(F.currentDay(parsed)), "30°/23°", "パネルの表示");
});

test("当てはめた持ち越しは次の更新でも残る", () => {
    // 控えを 1 日分しか持たないと、当てはめた直後に翌日分で上書きして今日の値を失う。
    // 予報は 30 分ごとに取り直すので、実機では次の更新で「29°」に戻って現れる。
    const F = h.loadForecast("2026-08-15T11:30:00+09:00");
    let saved = { station: "44132", mins: "2026-08-15=23" };

    for (const round of ["1 回目", "2 回目", "3 回目"]) {
        const parsed = F.parse(tempsOnly(...NEXT_DAY), "130010");
        F.applyCarriedMin(parsed, saved);
        eq(parsed.days["2026-08-15"].tmin, 23, `${round}: 今日の最低`);
        saved = F.carriedFrom(parsed, saved);
        ok(
            saved.mins.indexOf("2026-08-15=23") >= 0,
            `${round}: 今日の分が控えから消えた (${saved.mins})`
        );
    }
    eq(saved.mins, "2026-08-15=23;2026-08-16=24", "明日の分も控わっている");
});

test("過ぎた日の控えは落とす", () => {
    const { F, parsed } = TOMORROW();
    const saved = { station: "44132", mins: "2026-08-12=20;2026-08-13=21;2026-08-14=22" };
    eq(
        F.carriedFrom(parsed, saved).mins,
        "2026-08-14=22;2026-08-15=23",
        "今日より前は捨てる"
    );
});

test("観測所が変われば控えを捨てる", () => {
    // 地域を変えた人に別の場所の気温を出さない
    const { F, parsed } = TOMORROW();
    const saved = { station: "44172", mins: "2026-08-14=18;2026-08-15=19" };
    deepEq(
        F.carriedFrom(parsed, saved),
        { station: "44132", mins: "2026-08-15=23" },
        "前の観測所の控えは残さない"
    );
});

test("使えない控えは当てはめない", () => {
    const F = h.loadForecast("2026-08-15T11:30:00+09:00");
    const cases = [
        [{ station: "44132", mins: "2026-08-14=23" }, "今日の分が無い（起動していなかった日がある）"],
        [{ station: "44172", mins: "2026-08-15=23" }, "別の観測所（地域を変えた）"],
        [{ station: "44132", mins: "" }, "まだ控えていない"],
        [{ station: "44132", mins: "こわれた=データ;=;x" }, "壊れた控え"],
        [null, "控えが無い"]
    ];
    for (const [saved, why] of cases) {
        const parsed = F.parse(tempsOnly(...NEXT_DAY), "130010");
        eq(F.applyCarriedMin(parsed, saved), false, why);
        eq(parsed.days["2026-08-15"].tmin, null, `${why}: 埋めてはいけない`);
        eq(F.tempPairText(F.currentDay(parsed)), "30°", `${why}: パネルは最高だけ`);
    }
});

test("配信に今日の最低があるときは控えを使わない", () => {
    // 17時発表の翌日分など、配信側のほうが新しい
    const F = h.loadForecast("2026-08-15T04:00:00+09:00");
    const json = tempsOnly(
        ["2026-08-15T00:00:00+09:00", "2026-08-15T09:00:00+09:00"],
        ["22", "30"]
    );
    const parsed = F.parse(json, "130010");
    eq(F.applyCarriedMin(parsed, { station: "44132", mins: "2026-08-15=23" }), false);
    eq(parsed.days["2026-08-15"].tmin, 22, "配信の値のまま");
    eq(parsed.days["2026-08-15"].tminCarried, false, "持ち越しの印は付かない");
});

test("観測所が分からなければ控えを触らない", () => {
    const F = h.loadForecast("2026-08-14T11:30:00+09:00");
    eq(F.carriedFrom(null, { station: "", mins: "" }), null, "解析結果が無い");
    // 気温の系列そのものが無い配信
    const json = tempsOnly(...REVERSED);
    json[0].timeSeries.length = 2;
    eq(F.carriedFrom(F.parse(json, "130010"), { station: "", mins: "" }), null, "観測所が無い");
});

test("実データでも前日の配信から今日の最低を持ち越せる", () => {
    // 08-12 17時発表のフィクスチャで控え、2 日後の今日へ当てはめる。
    // 週間予報側からも控えるので、1 日空いても埋まる。
    const F1 = h.loadForecast("2026-08-13T20:00:00+09:00");
    const saved = F1.carriedFrom(F1.parse(TOKYO(), "130010"), { station: "", mins: "" });
    eq(saved.station, "44132", "観測所");

    const F2 = h.loadForecast("2026-08-14T11:30:00+09:00");
    const parsed = F2.parse(tempsOnly(...REVERSED), "130010");
    eq(parsed.days["2026-08-14"].tmin, null, "配信には今日の最低が無い");
    eq(F2.applyCarriedMin(parsed, saved), true, "当てはめた");

    // 期待値は JSON から導く（気温そのものは取り直すたびに変わる）
    const week = TOKYO()[1].timeSeries[1];
    const at = week.timeDefines.findIndex((t) => t.startsWith("2026-08-14"));
    const expected = parseInt(week.areas[0].tempsMin[at], 10);
    eq(parsed.days["2026-08-14"].tmin, expected, "週間予報の 08-14 の最低");
    note(`${saved.mins}`);
});

// ---- 時刻に依存する挙動（Date を固定して確かめる）----

const TOKYO = () => h.fixture("130000");

test("気温の無い今日は飛ばして翌日を主役にする", () => {
    const json = TOKYO();
    const today = reportDate(json);
    const F = h.loadForecast(`${today}T20:00:00+09:00`);
    const parsed = F.parse(json, "130010");
    const day = F.currentDay(parsed);

    const todayEntry = parsed.days[today];
    if (todayEntry && todayEntry.tmax === null && todayEntry.tmin === null) {
        ok(day.date > today, `今日 (${today}) のままになっている: ${day.date}`);
        eq(F.dayLabel(day.date), "明日", "見出し");
        note(`${today} は気温欠落 → ${day.date}`);
    } else {
        eq(day.date, today, "気温があるなら今日が主役");
        note(`${today} に気温あり`);
    }
});

test("気温のある日は今日を主役にする", () => {
    const json = TOKYO();
    // 気温が入っている最初の日を「今日」に見立てる
    const F0 = h.loadForecast();
    const parsed0 = F0.parse(json, "130010");
    const withTemp = parsed0.order.find((d) => parsed0.days[d].tmax !== null);
    ok(withTemp, "気温のある日が無い");

    const F = h.loadForecast(`${withTemp}T09:00:00+09:00`);
    const parsed = F.parse(json, "130010");
    const day = F.currentDay(parsed);
    eq(day.date, withTemp, "主役の日");
    eq(F.dayLabel(day.date), "今日", "見出し");
    ok(F.isToday(day), "isToday");
});

test("過ぎた時間帯の降水確率は落とす", () => {
    const json = TOKYO();
    const F0 = h.loadForecast();
    const all = F0.parse(json, "130010").pops6h;
    const date = all[all.length - 1].date; // 6 時間ごとの枠が揃っている日
    const hours = all.filter((p) => p.date === date).map((p) => p.hour);
    ok(hours.length > 1, "比較できる時間帯が足りない");

    const at = Math.max(...hours);
    const F = h.loadForecast(`${date}T${String(at).padStart(2, "0")}:30:00+09:00`);
    const remaining = F.remainingPops(F.parse(json, "130010"));

    for (const p of remaining) {
        ok(p.date >= date, `過去の日付が残っている: ${p.date}`);
        if (p.date === date) {
            ok(p.hour + 6 > at, `終わった時間帯が残っている: ${p.hour}時`);
        }
    }
    ok(
        remaining.some((p) => p.date === date && p.hour === at),
        "進行中の時間帯が落ちている"
    );
    note(`${date} ${at}時30分時点で ${remaining.length}/${all.length} 件`);
});

test("夜は 18 時から 6 時まで", () => {
    const cases = [
        ["05:59", true],
        ["06:00", false],
        ["12:00", false],
        ["17:59", false],
        ["18:00", true],
        ["23:59", true]
    ];
    for (const [hhmm, expected] of cases) {
        const F = h.loadForecast(`2026-08-12T${hhmm}:00+09:00`);
        eq(F.isNight(), expected, `${hhmm} の夜判定`);
    }
});

test("日付の見出しは今日/明日/明後日、以降は日付", () => {
    const F = h.loadForecast("2026-08-12T12:00:00+09:00");
    eq(F.dayLabel("2026-08-12"), "今日");
    eq(F.dayLabel("2026-08-13"), "明日");
    eq(F.dayLabel("2026-08-14"), "明後日");
    eq(F.dayLabel("2026-08-15"), "8/15(土)");
    eq(F.shortDate("2026-08-15"), "8/15(土)");
    // 月をまたいでも桁を足さない
    eq(F.shortDate("2026-09-01"), "9/1(火)");
});

// ---- 表示の整形 ----

test("気温と降水確率の欠損はダッシュにする", () => {
    const F = h.loadForecast();
    eq(F.tempText(29), "29°");
    eq(F.tempText(0), "0°");
    eq(F.tempText(-3), "-3°");
    eq(F.tempText(null), "–");
    eq(F.tempText(undefined), "–");
    eq(F.tempText(NaN), "–");
    eq(F.popText(0), "0%");
    eq(F.popText(null), "–");
    eq(F.popText(NaN), "–");
});

test("パネルの気温は片方しか無ければ 1 つだけ出す", () => {
    const F = h.loadForecast();
    eq(F.tempPairText({ tmax: 29, tmin: 23 }), "29°/23°");
    eq(F.tempPairText({ tmax: 29, tmin: null }), "29°", "持ち越しも無い今日");
    eq(F.tempPairText({ tmax: null, tmin: 23 }), "23°");
    eq(F.tempPairText({ tmax: null, tmin: null }), "–");
    eq(F.tempPairText(null), "–");
});

test("天気文の全角スペースを詰める", () => {
    const F = h.loadForecast();
    eq(F.cleanText("晴れ　時々　くもり"), "晴れ 時々 くもり");
    eq(F.cleanText("　前後の空白　"), "前後の空白");
    eq(F.cleanText(""), "");
    eq(F.cleanText(null), "");
});

test("発表時刻の整形", () => {
    const F = h.loadForecast();
    eq(F.formatReportTime("2026-08-12T17:00:00+09:00"), "08/12 17:00 発表");
    eq(F.formatReportTime(""), "");
    eq(F.formatReportTime(null), "");
});

// ---- 壊れた入力で落ちない ----

test("知らない区域コードは先頭の区域に落とす", () => {
    const json = TOKYO();
    const F = h.loadForecast();
    const parsed = F.parse(json, "999999");
    eq(parsed.areaName, json[0].timeSeries[0].areas[0].area.name, "先頭の区域名");
    ok(parsed.order.length > 0, "日付が空");
});

test("週間予報が無くても対応表から観測所を引ける", () => {
    const json = TOKYO();
    const F = h.loadForecast();
    const parsed = F.parse([json[0]], "130010");
    ok(parsed.order.length > 0, "日付が空");
    eq(parsed.stationCode, areas.stationsOf("130010")[0], "対応表の観測所");
    eq(parsed.weekStationCode, "", "週間側は空のまま");
    ok(
        parsed.order.some((d) => parsed.days[d].tmax !== null),
        "短期分の気温が取れていない"
    );
});

test("対応表にも週間予報にも無ければ観測所を位置で決める", () => {
    const json = TOKYO();
    const F = h.loadForecast();
    // 知らない区域コードは対応表を引けない（区域が再編された直後など）
    deepEq(areas.stationsOf("999999"), [], "対応表に無いこと");
    const parsed = F.parse([json[0]], "999999");
    eq(
        parsed.stationCode,
        json[0].timeSeries[2].areas[0].area.code,
        "天気の区域と同じ位置（先頭）に落とす"
    );
});

test("空の予報では currentDay が null", () => {
    const F = h.loadForecast();
    eq(F.currentDay(null), null);
    eq(F.currentDay({ order: [], days: {} }), null);
    deepEq(F.remainingPops(null), []);
});

module.exports = { register };
