.pragma library
.import "Telops.js" as Telops

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
        stationName: ""
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
    // 気温の観測所は短期・週間とも同じコード体系。週間側は天気の区域と 1 対 1 に並ぶので、
    // まず週間の区域を確定させ、そこで得た観測所コードを短期の気温系列にも使う。
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
    // 週間側で確定した観測所コードで引き、見つからなければ位置に落とす。
    if (short.timeSeries.length > 2) {
        var ts2 = short.timeSeries[2];
        var ti = stationCode !== null ? findArea(ts2.areas, stationCode) : -1;
        if (ti < 0) {
            ti = Math.min(wi, ts2.areas.length - 1);
        }
        var ta = ts2.areas[ti];
        out.stationName = ta.area.name;
        for (var k = 0; k < ts2.timeDefines.length; k++) {
            var tv = blankToNull(ta.temps[k]);
            if (tv === null) {
                continue;
            }
            var td = day(ymd(ts2.timeDefines[k]));
            // 00時の値が最低気温、09時の値が最高気温
            if (hour(ts2.timeDefines[k]) === "00") {
                td.tmin = parseInt(tv, 10);
            } else {
                td.tmax = parseInt(tv, 10);
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
