.pragma library
.import "WarnCodes.js" as WarnCodes

// 気象庁 warning/data/r8/{予報区}.json を解析する。
//
// **配信先を data/warning/ に戻さないこと。** そちらにも同じ名前の JSON があるが、
// 2026年5月28日で更新が止まっている（気象庁のページも r8 を読んでいる）。古い方を
// 見ていると、大雨特別警報が出ていてもウィジェットは静かなままになる。
//
// JSON は電文ごとの配列で、大雨・土砂災害・強風などが別々の要素として届く。
// 同じ地域の警報が複数の要素に散らばるので、全部を混ぜて一つにまとめる。
// warning.class10Items が一次細分区域、class20Items が市区町村。ウィジェットは
// 一次細分区域までしか扱わないので class10Items だけを見る。区域コードは Areas.js の
// 地域コードとそのまま一致する（全 58 予報区 142 地域で確認済み）ので、
// 予報側のような受け皿の寄せ直しは要らない。

// 気象庁は解除された警報も「解除」として同じ配列に残す。実データでは解除の方が
// 発表中より多いことすらあるので、落とさずに並べると解除済みばかりが表示される。
// 「警報から注意報」「危険警報から警報」のような遷移は格下げされただけで発表中。
// code が今の状態を指しているので、落とすのは「解除」だけでよい。
var CLEARED = "解除";

function itemsOf(item) {
    var items = [];
    if (!item || !item.kinds) {
        return items;
    }
    for (var i = 0; i < item.kinds.length; i++) {
        var k = item.kinds[i];
        // code を持たないものは「発表警報・注意報はなし」の目印
        if (!k.code || k.status === CLEARED) {
            continue;
        }
        items.push({
            code: k.code,
            name: WarnCodes.name(k.code),
            level: WarnCodes.level(k.code),
            status: k.status || ""
        });
    }
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
    if (!json || !json.length) {
        return out;
    }

    for (var e = 0; e < json.length; e++) {
        var entry = json[e];
        if (!entry || !entry.warning || !entry.warning.class10Items) {
            continue;
        }
        var list = entry.warning.class10Items;
        for (var i = 0; i < list.length; i++) {
            if (list[i].areaCode !== areaCode) {
                continue;
            }
            out.found = true;
            // 電文ごとに発表時刻が違う。表に出すのは一番新しいもの。
            if ((entry.reportDatetime || "") > out.reportTime) {
                out.reportTime = entry.reportDatetime || "";
            }
            var found = itemsOf(list[i]);
            for (var j = 0; j < found.length; j++) {
                out.items.push(found[j]);
                // 見出しは一番重い警報を伝えている電文のものを使う。
                // 電文ごとに別の文が付いていて、並べると同じ話が何度も出る。
                if (found[j].level > out.maxLevel) {
                    out.maxLevel = found[j].level;
                    out.headline = entry.headlineText || "";
                }
            }
        }
    }

    // 深刻な順に並べる。同じ深刻さの中はコード順（気象庁の並びに近い）。
    out.items.sort(function (a, b) {
        return a.level !== b.level ? b.level - a.level : (a.code < b.code ? -1 : 1);
    });
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
