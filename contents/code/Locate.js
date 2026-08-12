.pragma library

// IP アドレスから現在地の一次細分区域を割り出す。
//
// 気象庁は位置情報を配信していないので、座標を得るところだけ外部サービスに頼る。
// ここが唯一 jma.go.jp 以外と通信する箇所なので、判定は 1 日 1 回に抑え、
// 結果が外れたときのために手動指定を残してある（main.qml の locationMode）。
//
// 通信そのものは LocationSource.qml が持つ。この中は URL と解析と距離だけで、
// テストから素の関数として呼べる状態にしてある。

// 上から順に試し、最初に読めたものを採用する。どちらもキー不要・HTTPS・IPv6 可。
// 応答の形が latitude / longitude / country_code で揃っているので解析は共通。
var PROVIDERS = [
    { name: "geojs.io", url: "https://get.geojs.io/v1/ip/geo.json" },
    { name: "ipwho.is", url: "https://ipwho.is/" }
];

// 最近傍がこれより遠ければ日本国内ではないとみなす。
// ソウルからでも対馬が 395km で引っかかるため、距離の蓋は必ず要る。
var MAX_KM = 100;

// 応答から座標と国コードだけ取り出す。読めなければ null を返して次の候補へ回す。
function readLocation(json) {
    if (!json || json.success === false || json.error) {
        return null;
    }
    var lat = Number(json.latitude);
    var lon = Number(json.longitude);
    if (!isFinite(lat) || !isFinite(lon) || (lat === 0 && lon === 0)) {
        return null;
    }
    return {
        lat: lat,
        lon: lon,
        country: json.country_code ? String(json.country_code) : ""
    };
}

// 距離は緯度 1 度 111km の平面近似で足りる。国内の最近傍を選ぶだけで、
// 実距離そのものは 100km の蓋にしか使っていない。
function distanceKm(lat1, lon1, lat2, lon2) {
    var dy = (lat1 - lat2) * 111.0;
    var dx = (lon1 - lon2) * 111.0 * Math.cos((lat1 + lat2) * 0.5 * Math.PI / 180);
    return Math.sqrt(dx * dx + dy * dy);
}

// Geo.POINTS の中で一番近い市区町村を探し、その一次細分区域コードを返す。
function nearestArea(lat, lon, points) {
    var best = "";
    var bestKm = Infinity;
    for (var code in points) {
        var list = points[code];
        for (var i = 0; i < list.length; i++) {
            var km = distanceKm(lat, lon, list[i][0], list[i][1]);
            if (km < bestKm) {
                bestKm = km;
                best = code;
            }
        }
    }
    if (best === "" || bestKm > MAX_KM) {
        return null;
    }
    return { areaCode: best, distance: bestKm };
}

// readLocation の結果を区域まで落とす。国外と分かっているなら距離を見るまでもない。
function resolve(location, points) {
    if (!location) {
        return null;
    }
    if (location.country && location.country !== "JP") {
        return null;
    }
    return nearestArea(location.lat, location.lon, points);
}
