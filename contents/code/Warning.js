.pragma library
.import "WarnCodes.js" as WarnCodes

// 気象庁 warning/data/warning/{予報区}.json を解析する。
//
// JSON の areaTypes[0] が一次細分区域、areaTypes[1] が市区町村。ウィジェットは
// 一次細分区域までしか扱わないので [0] だけを見る。区域コードは Areas.js の
// 地域コードとそのまま一致する（全 58 予報区 142 地域で確認済み）ので、
// 予報側のような受け皿の寄せ直しは要らない。
//
// timeSeries には危険度の推移が入っているが、パネルに出すには細かすぎるので使わない。

// 気象庁は解除された警報も「解除」として同じ配列に残す。実データでは解除の方が
// 発表中より多いことすらあるので、落とさずに並べると解除済みばかりが表示される。
var CLEARED = "解除";

function itemsOf(area) {
    var items = [];
    if (!area || !area.warnings) {
        return items;
    }
    for (var i = 0; i < area.warnings.length; i++) {
        var w = area.warnings[i];
        // code を持たないものは「発表警報・注意報はなし」の目印
        if (!w.code || w.status === CLEARED) {
            continue;
        }
        items.push({
            code: w.code,
            name: WarnCodes.name(w.code),
            level: WarnCodes.level(w.code),
            status: w.status || ""
        });
    }
    // 深刻な順に並べる。同じ深刻さの中はコード順（気象庁の並びに近い）。
    items.sort(function (a, b) {
        return a.level !== b.level ? b.level - a.level : (a.code < b.code ? -1 : 1);
    });
    return items;
}

function parse(json, areaCode) {
    var out = {
        reportTime: "",
        headline: "",
        items: [],
        maxLevel: 0,
        found: false
    };
    if (!json || !json.areaTypes || json.areaTypes.length === 0) {
        return out;
    }
    out.reportTime = json.reportDatetime || "";
    // 予報区全体に対する文なので、他の地域の話が混ざる。地域別の警報名の添え物として扱う。
    out.headline = json.headlineText || "";

    var areas = json.areaTypes[0].areas || [];
    for (var i = 0; i < areas.length; i++) {
        if (areas[i].code === areaCode) {
            out.found = true;
            out.items = itemsOf(areas[i]);
            break;
        }
    }
    for (var j = 0; j < out.items.length; j++) {
        if (out.items[j].level > out.maxLevel) {
            out.maxLevel = out.items[j].level;
        }
    }
    return out;
}

// level 以上のものだけを「大雨警報・洪水警報」の形にまとめる（0 を渡せば全部）
function names(parsed, minLevel, maxLevel) {
    if (!parsed) {
        return "";
    }
    var out = [];
    for (var i = 0; i < parsed.items.length; i++) {
        var item = parsed.items[i];
        if (item.level >= minLevel && (maxLevel === undefined || item.level <= maxLevel)) {
            out.push(item.name);
        }
    }
    return out.join("・");
}

// 警報以上（＝パネルで目立たせる対象）が出ているか
function hasWarning(parsed) {
    return !!parsed && parsed.maxLevel >= WarnCodes.WARNING;
}

function hasAny(parsed) {
    return !!parsed && parsed.items.length > 0;
}

function warningNames(parsed) {
    return names(parsed, WarnCodes.WARNING);
}

function advisoryNames(parsed) {
    return names(parsed, 0, WarnCodes.WARNING - 1);
}

// ツールチップ用。警報も注意報も区別せず 1 行にする。
function summary(parsed) {
    return names(parsed, 0);
}

function levelLabel(level) {
    if (level >= WarnCodes.EMERGENCY) {
        return "特別警報";
    }
    if (level >= WarnCodes.CRITICAL) {
        return "危険警報";
    }
    if (level >= WarnCodes.WARNING) {
        return "警報";
    }
    return "注意報";
}
