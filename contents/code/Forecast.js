.pragma library
.import "Telops.js" as Telops
.import "Areas.js" as Areas

// 気象庁 forecast/data/forecast/{office}.json を解析する。
// JSON は 2 要素の配列で、[0] が 3日先までの短期予報、[1] が週間予報。
// 同じ日付が両方に現れるので、細かい短期予報を優先し、足りない分を週間で埋める。

function pad2(n) {
    return (n < 10 ? "0" : "") + n;
}

function ymd(iso) {
    return iso.substring(0, 10);
}

function hour(iso) {
    return iso.substring(11, 13);
}

function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}

function findArea(areas, code) {
    for (var i = 0; i < areas.length; i++) {
        if (areas[i].area.code === code) {
            return i;
        }
    }
    return -1;
}

function codesOf(areas) {
    var out = [];
    for (var i = 0; i < areas.length; i++) {
        out.push(areas[i].area.code);
    }
    return out;
}

// 週間予報は区域のくくりが粗く、短期予報の区域コードがそのまま出てこないことが多い
// （例: 短期「中通り」「浜通り」→ 週間「中通り・浜通り」）。
// 短期側に無いコードを持つ週間区域が「受け皿」なので、一致しなければそこへ寄せる。
// 全国 58 予報区で受け皿は必ず 1 つに定まることを確認済み。
function resolveWeekIndex(weekAreas, shortCodes, areaCode, shortIndex) {
    var exact = findArea(weekAreas, areaCode);
    if (exact >= 0) {
        return exact;
    }
    var catchAll = -1;
    for (var i = 0; i < weekAreas.length; i++) {
        if (shortCodes.indexOf(weekAreas[i].area.code) < 0) {
            if (catchAll >= 0) {
                catchAll = -1;
                break;
            }
            catchAll = i;
        }
    }
    if (catchAll >= 0) {
        return catchAll;
    }
    return Math.min(Math.max(0, shortIndex), weekAreas.length - 1);
}

function blankToNull(v) {
    return (v === undefined || v === null || v === "") ? null : v;
}

function emptyDay(date) {
    return {
        date: date,
        code: null,
        label: null,
        text: null,
        wind: null,
        pop: null,
        tmin: null,
        tmax: null,
        // 今日の最低気温を前日の配信から持ち越したか（表示で区別するため）
        tminCarried: false,
        reliability: null
    };
}

function parse(json, areaCode) {
    var out = {
        reportTime: "",
        publishingOffice: "",
        days: {},
        order: [],
        pops6h: [],
        areaName: "",
        // 短期予報（今日・明日）の気温を出している観測所
        stationName: "",
        stationCode: "",
        // 週間予報（明後日以降）の気温を出している観測所。区域のくくりが粗いので
        // 短期側とは別の場所になることが多い（142 地域中 78）
        weekStationName: "",
        weekStationCode: ""
    };

    function day(date) {
        if (!out.days[date]) {
            out.days[date] = emptyDay(date);
            out.order.push(date);
        }
        return out.days[date];
    }

    var short = json[0];
    out.reportTime = short.reportDatetime || "";
    out.publishingOffice = short.publishingOffice || "";

    // --- 短期予報: 天気・風 ---
    var ts0 = short.timeSeries[0];
    var wi = findArea(ts0.areas, areaCode);
    if (wi < 0) {
        wi = 0;
    }
    var wa = ts0.areas[wi];
    out.areaName = wa.area.name;
    for (var i = 0; i < ts0.timeDefines.length; i++) {
        var d = day(ymd(ts0.timeDefines[i]));
        d.code = blankToNull(wa.weatherCodes[i]);
        d.text = blankToNull(wa.weathers ? wa.weathers[i] : null);
        d.wind = blankToNull(wa.winds ? wa.winds[i] : null);
        if (d.code) {
            d.label = Telops.label(d.code);
        }
    }

    // --- 短期予報: 降水確率（6時間ごと）---
    if (short.timeSeries.length > 1) {
        var ts1 = short.timeSeries[1];
        var pi = findArea(ts1.areas, areaCode);
        if (pi < 0) {
            pi = 0;
        }
        var pa = ts1.areas[pi];
        for (var j = 0; j < ts1.timeDefines.length; j++) {
            var pv = blankToNull(pa.pops[j]);
            if (pv === null) {
                continue;
            }
            var pd = day(ymd(ts1.timeDefines[j]));
            var n = parseInt(pv, 10);
            // その日の代表値は最大値を採る
            if (pd.pop === null || n > pd.pop) {
                pd.pop = n;
            }
            out.pops6h.push({
                time: ts1.timeDefines[j],
                date: ymd(ts1.timeDefines[j]),
                hour: parseInt(hour(ts1.timeDefines[j]), 10),
                value: n
            });
        }
    }

    // --- 週間予報 ---
    // 週間側は天気の区域と 1 対 1 に並ぶので、区域を確定させればその観測所も決まる。
    // 週間の気温はこの観測所のもので、短期の気温を引く際の予備にもなる。
    var stationCode = null;
    if (json.length > 1) {
        var week = json[1];
        var ws0 = week.timeSeries[0];
        var wwi = resolveWeekIndex(ws0.areas, codesOf(ts0.areas), areaCode, wi);
        var wwa = ws0.areas[wwi];
        for (var m = 0; m < ws0.timeDefines.length; m++) {
            var wd = day(ymd(ws0.timeDefines[m]));
            var wc = blankToNull(wwa.weatherCodes[m]);
            if (wc !== null && wd.code === null) {
                wd.code = wc;
                wd.label = Telops.label(wc);
            }
            var wp = blankToNull(wwa.pops ? wwa.pops[m] : null);
            if (wp !== null && wd.pop === null) {
                wd.pop = parseInt(wp, 10);
            }
            var wr = blankToNull(wwa.reliabilities ? wwa.reliabilities[m] : null);
            if (wr !== null) {
                wd.reliability = wr;
            }
        }

        if (week.timeSeries.length > 1) {
            var ws1 = week.timeSeries[1];
            var wti = Math.min(wwi, ws1.areas.length - 1);
            var wta = ws1.areas[wti];
            stationCode = wta.area.code;
            out.weekStationName = wta.area.name;
            out.weekStationCode = stationCode;
            for (var n2 = 0; n2 < ws1.timeDefines.length; n2++) {
                var wtd = day(ymd(ws1.timeDefines[n2]));
                var mn = blankToNull(wta.tempsMin[n2]);
                var mx = blankToNull(wta.tempsMax[n2]);
                if (mn !== null && wtd.tmin === null) {
                    wtd.tmin = parseInt(mn, 10);
                }
                if (mx !== null && wtd.tmax === null) {
                    wtd.tmax = parseInt(mx, 10);
                }
            }
        }
    }

    // --- 短期予報: 気温 ---
    // 短期の気温は観測所が細かく、天気の区域とは数が合わないため位置では引けない。
    // 気象庁が配信している対応表（Areas.js の stations）で区域から直に引く。
    // 1 区域に複数割り当てられていることがあり（21 区域）、先頭が配信に載っていない
    // こともある（愛媛県中予）ので、実際に居るものを順に探す。
    //
    // 表から引けなければ週間側で確定した観測所、それも駄目なら位置に落とす。
    // 週間側は区域のくくりが粗く、そのまま使うと 142 地域中 78 で別の場所になる
    // （千葉県北西部が銚子、山形県庄内が山形など）。予備なので順番を入れ替えない。
    if (short.timeSeries.length > 2) {
        var ts2 = short.timeSeries[2];
        var ti = -1;
        var cands = Areas.stationsOf(areaCode);
        for (var c = 0; c < cands.length && ti < 0; c++) {
            ti = findArea(ts2.areas, cands[c]);
        }
        if (ti < 0 && stationCode !== null) {
            ti = findArea(ts2.areas, stationCode);
        }
        if (ti < 0) {
            ti = Math.min(wi, ts2.areas.length - 1);
        }
        var ta = ts2.areas[ti];
        out.stationName = ta.area.name;
        out.stationCode = ta.area.code;
        var maxSeen = {};
        for (var k = 0; k < ts2.timeDefines.length; k++) {
            var tv = blankToNull(ta.temps[k]);
            if (tv === null) {
                continue;
            }
            var tdate = ymd(ts2.timeDefines[k]);
            var td = day(tdate);
            // 00時の値が最低気温、09時の値が最高気温。
            //
            // ただし今日の朝の最低気温は 5時・11時発表には入っていない（発表時点で既に
            // 過ぎているため）。枠だけは残っていて、今日の分が [09時, 00時] という逆順で
            // 並び、後ろの00時に最高気温と同じ値が届く。元の電文ではこの枠の型が
            // 「朝の最低気温」ではなく「最高気温」で、気象庁のページも読み捨てている。
            // 同じ日の09時より後ろに来た00時は最低気温ではないので採らない。
            //
            // 発表時刻ではなく並び順で見るのは、冬日の「最高＝最低」を潰さないため。
            if (hour(ts2.timeDefines[k]) === "00") {
                if (maxSeen[tdate]) {
                    continue;
                }
                td.tmin = parseInt(tv, 10);
            } else {
                td.tmax = parseInt(tv, 10);
                maxSeen[tdate] = true;
            }
        }
    }

    out.order.sort();
    return out;
}

// パネルと大きい表示で主役にする日。
// 17時発表以降は今日の最高・最低気温が配信対象から外れて空になるため、
// 気温が全く無い今日は飛ばして翌日を主役にする（見出しに「明日」と出る）。
function currentDay(parsed) {
    if (!parsed || parsed.order.length === 0) {
        return null;
    }
    var t = todayStr();
    for (var i = 0; i < parsed.order.length; i++) {
        var d = parsed.days[parsed.order[i]];
        if (d.date < t) {
            continue;
        }
        if (d.tmax === null && d.tmin === null && i + 1 < parsed.order.length) {
            continue;
        }
        return d;
    }
    return parsed.days[parsed.order[parsed.order.length - 1]];
}

function isToday(day) {
    return !!day && day.date === todayStr();
}

// ---- 今日の最低気温の持ち越し ----
//
// 今日の朝の最低気温は 5時・11時発表には入っていないが、昨日の配信には「明日の最低」として
// 入っていた（17時発表なら翌日の枠、5時・11時発表なら短期の「明日00時」の枠）。
// 取得のたびに明日の分を控えておけば、日付が変わったあとに追加の通信なしで使える。

// 控えは「日付=最低気温」を ; でつないだ 1 行。1 日分だけ持つと、当てはめた直後に
// 翌日分で上書きして今日の値を失う（更新のたびに解析し直すため）。まとめて持つ。
function parseCarried(text) {
    var out = {};
    if (!text) {
        return out;
    }
    var parts = String(text).split(";");
    for (var i = 0; i < parts.length; i++) {
        var kv = parts[i].split("=");
        if (kv.length !== 2) {
            continue;
        }
        var v = parseInt(kv[1], 10);
        if (!isNaN(v)) {
            out[kv[0]] = v;
        }
    }
    return out;
}

function formatCarried(map) {
    var keys = [];
    for (var k in map) {
        if (map.hasOwnProperty(k)) {
            keys.push(k);
        }
    }
    keys.sort();
    var parts = [];
    for (var i = 0; i < keys.length; i++) {
        parts.push(keys[i] + "=" + map[keys[i]]);
    }
    return parts.join(";");
}

// 控え直した内容を返す（変える必要が無ければ null）。観測所が変わっていたら前の控えは
// 捨てる。地域を変えた人に別の場所の気温を出さないため。
function carriedFrom(parsed, saved) {
    if (!parsed || !parsed.stationCode) {
        return null;
    }
    var t = todayStr();
    var map = (saved && saved.station === parsed.stationCode)
        ? parseCarried(saved.mins)
        : {};
    for (var k in map) {
        if (map.hasOwnProperty(k) && k < t) {
            delete map[k];
        }
    }
    // 今日の分も入れておく。当てはめ済みの持ち越しがここで残り、次の更新でも使える。
    // 週間予報のぶん（最大 7 日先）まで控えるので、数日空けて起動しても埋まる。
    for (var i = 0; i < parsed.order.length; i++) {
        var d = parsed.days[parsed.order[i]];
        if (d.date >= t && d.tmin !== null) {
            map[d.date] = d.tmin;
        }
    }
    return { station: parsed.stationCode, mins: formatCarried(map) };
}

// 控えた値を今日へ当てはめる。観測所が食い違えば使わない（黙って捨てる）。
function applyCarriedMin(parsed, saved) {
    if (!parsed || !saved || !parsed.stationCode
        || saved.station !== parsed.stationCode) {
        return false;
    }
    var t = todayStr();
    var d = parsed.days[t];
    // 今日の最低が配信に載っているならそちらが新しい
    if (!d || d.tmin !== null) {
        return false;
    }
    var map = parseCarried(saved.mins);
    if (!map.hasOwnProperty(t)) {
        return false;
    }
    d.tmin = map[t];
    d.tminCarried = true;
    return true;
}

// 今日の残りの降水確率だけを返す（既に過ぎた時間帯は落とす）
function remainingPops(parsed) {
    if (!parsed) {
        return [];
    }
    var now = new Date();
    var t = todayStr();
    var res = [];
    for (var i = 0; i < parsed.pops6h.length; i++) {
        var p = parsed.pops6h[i];
        if (p.date < t) {
            continue;
        }
        if (p.date === t && p.hour + 6 <= now.getHours()) {
            continue;
        }
        res.push(p);
    }
    return res;
}

function isNight() {
    var h = new Date().getHours();
    return h >= 18 || h < 6;
}

function tempText(v) {
    return v === null || v === undefined || isNaN(v) ? "–" : v + "°";
}

// パネル用の「29°/23°」。持ち越しも無く最低が空のままの日は、
// 「29°/–」と並べても情報が無いので残っている方だけを出す
function tempPairText(day) {
    if (!day) {
        return "–";
    }
    if (day.tmin === null || day.tmin === undefined) {
        return tempText(day.tmax);
    }
    if (day.tmax === null || day.tmax === undefined) {
        return tempText(day.tmin);
    }
    return tempText(day.tmax) + "/" + tempText(day.tmin);
}

function popText(v) {
    return v === null || v === undefined || isNaN(v) ? "–" : v + "%";
}

var WDAY = ["日", "月", "火", "水", "木", "金", "土"];

function dayLabel(dateStr) {
    var t = todayStr();
    var parts = dateStr.split("-");
    var dt = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    var diff = Math.round((dt - new Date(t.split("-")[0], parseInt(t.split("-")[1], 10) - 1, t.split("-")[2])) / 86400000);
    if (diff === 0) {
        return "今日";
    }
    if (diff === 1) {
        return "明日";
    }
    if (diff === 2) {
        return "明後日";
    }
    return parseInt(parts[1], 10) + "/" + parseInt(parts[2], 10) + "(" + WDAY[dt.getDay()] + ")";
}

function shortDate(dateStr) {
    var parts = dateStr.split("-");
    var dt = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    return parseInt(parts[1], 10) + "/" + parseInt(parts[2], 10) + "(" + WDAY[dt.getDay()] + ")";
}

// 気象庁の天気文は全角スペース区切りなので、読みやすさのため詰める
function cleanText(t) {
    return t ? t.replace(/　/g, " ").replace(/\s+/g, " ").trim() : "";
}

function formatReportTime(iso) {
    if (!iso) {
        return "";
    }
    return iso.substring(5, 7) + "/" + iso.substring(8, 10) + " " + iso.substring(11, 16) + " 発表";
}
