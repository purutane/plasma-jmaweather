.pragma library
.import "WarnCodesData.js" as Data

// 警報・注意報コードから名称と深刻さを引く。
// 表そのもの（CODES）は生成物の WarnCodesData.js にある。

var CODES = Data.CODES;

// 気象庁のページが使っている重み。数値の大小がそのまま深刻さの順になる。
var ADVISORY = 20;   // 注意報
var WARNING = 30;    // 警報
var CRITICAL = 40;   // 危険警報
var EMERGENCY = 50;  // 特別警報

// 表に無いコードは新設された警報とみなして警報扱いにする。
// 名前が分からないものを黙って捨てると、コードが増えた日に特別警報を
// 出し損ねる。出しすぎる方に倒しておき、コード番号をそのまま見せる。
function name(code) {
    var e = CODES[String(code)];
    return e ? e[0] : "警報・注意報（コード " + code + "）";
}

function level(code) {
    var e = CODES[String(code)];
    return e ? e[1] : WARNING;
}

function known(code) {
    return !!CODES[String(code)];
}
