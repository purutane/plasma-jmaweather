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

    test(`気温は週間側で確定した観測所から引く${suffix}`, () => {
        eachArea(dir, (area, json, code) => {
            if (json.length < 2 || json[1].timeSeries.length < 2) {
                return;
            }
            const parsed = h.loadForecast().parse(json, area.code);
            const weekStations = json[1].timeSeries[1].areas;
            const chosen = weekStations.find((a) => a.area.name === parsed.stationName);
            ok(
                chosen,
                `${code}/${area.code}: 観測所 ${parsed.stationName} が週間予報側に無い`
            );
            // README の主張: 週間側の観測所コードは短期側にも必ず存在する
            const shortStations = codesOf(json[0].timeSeries[2]);
            ok(
                shortStations.includes(chosen.area.code),
                `${code}/${area.code}: 週間の観測所 ${chosen.area.code} が短期側に無い。` +
                    "位置フォールバックに落ちて別地域の気温を拾う"
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

// 週間側のどの区域に寄るかを固定する。
// 上の「観測所が短期側にも居るか」だけでは、別地域の予報を拾っていても通ってしまう
// （並び順で寄せる実装でも偶然そこに観測所は在るため）。README が挙げている
// 「並び順だと別地域を拾う 5 箇所」を名指しで押さえておく。
//
// 観測所は寄せ先の週間区域から決まるので、観測所名を見れば寄せ先が分かる。
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
            parsed.stationName,
            station,
            `${name} の観測所${why ? "（" + why + "）" : ""}`
        );
    }
    note(`${WEEK_STATION.length} 地域`);
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

test("週間予報が無ければ観測所を位置で決める", () => {
    const json = TOKYO();
    const F = h.loadForecast();
    const parsed = F.parse([json[0]], "130010");
    ok(parsed.order.length > 0, "日付が空");
    // 観測所コードの手掛かりが無いので、天気の区域と同じ位置の観測所に落とす
    const wi = json[0].timeSeries[0].areas.findIndex((a) => a.area.code === "130010");
    eq(parsed.stationName, json[0].timeSeries[2].areas[wi].area.name, "位置フォールバック");
    ok(
        parsed.order.some((d) => parsed.days[d].tmax !== null),
        "短期分の気温が取れていない"
    );
});

test("空の予報では currentDay が null", () => {
    const F = h.loadForecast();
    eq(F.currentDay(null), null);
    eq(F.currentDay({ order: [], days: {} }), null);
    deepEq(F.remainingPops(null), []);
});

module.exports = { register };
