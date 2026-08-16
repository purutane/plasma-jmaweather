.pragma library
.import "TelopsData.js" as Data

// 天気コードから Breeze のアイコン名と日本語ラベルを引く。
// 表そのもの（TELOPS）は生成物の TelopsData.js にある。

var TELOPS = Data.TELOPS;

// 昼のアイコンに対応する夜のアイコン。ここに無いものは昼夜で絵が変わらない
// （曇り・雨・雪など）ので、そのまま使う。
var NIGHT = {
    "weather-clear": "weather-clear-night",
    "weather-few-clouds": "weather-few-clouds-night",
    "weather-clouds": "weather-clouds-night",
    "weather-showers-day": "weather-showers-night",
    "weather-showers-scattered-day": "weather-showers-scattered-night",
    "weather-snow-scattered-day": "weather-snow-scattered-night"
};

function icon(code, night) {
    var e = TELOPS[String(code)];
    if (!e) return "weather-none-available";
    return night && NIGHT[e[0]] ? NIGHT[e[0]] : e[0];
}

function label(code) {
    var e = TELOPS[String(code)];
    return e ? e[1] : "--";
}
