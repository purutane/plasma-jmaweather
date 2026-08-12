.pragma library

// 気象庁 予報区一覧（common/const/area.json より生成）
// tools/generate_data.py が書き出すので手で編集しない

// 短期予報の配信コードが area.json と食い違う2件を補正する
var REMAP = { "014030": "014100", "460040": "460100" };

function endpoint(officeCode) {
    return REMAP[officeCode] || officeCode;
}

var OFFICES = [
    {"code": "011000", "name": "宗谷地方", "areas": [{"code": "011000", "name": "宗谷地方"}]},
    {"code": "012000", "name": "上川・留萌地方", "areas": [{"code": "012010", "name": "上川地方"}, {"code": "012020", "name": "留萌地方"}]},
    {"code": "013000", "name": "網走・北見・紋別地方", "areas": [{"code": "013010", "name": "網走地方"}, {"code": "013020", "name": "北見地方"}, {"code": "013030", "name": "紋別地方"}]},
    {"code": "014030", "name": "十勝地方", "areas": [{"code": "014030", "name": "十勝地方"}]},
    {"code": "014100", "name": "釧路・根室地方", "areas": [{"code": "014010", "name": "根室地方"}, {"code": "014020", "name": "釧路地方"}]},
    {"code": "015000", "name": "胆振・日高地方", "areas": [{"code": "015010", "name": "胆振地方"}, {"code": "015020", "name": "日高地方"}]},
    {"code": "016000", "name": "石狩・空知・後志地方", "areas": [{"code": "016010", "name": "石狩地方"}, {"code": "016020", "name": "空知地方"}, {"code": "016030", "name": "後志地方"}]},
    {"code": "017000", "name": "渡島・檜山地方", "areas": [{"code": "017010", "name": "渡島地方"}, {"code": "017020", "name": "檜山地方"}]},
    {"code": "020000", "name": "青森県", "areas": [{"code": "020010", "name": "津軽"}, {"code": "020020", "name": "下北"}, {"code": "020030", "name": "三八上北"}]},
    {"code": "030000", "name": "岩手県", "areas": [{"code": "030010", "name": "内陸"}, {"code": "030020", "name": "沿岸北部"}, {"code": "030030", "name": "沿岸南部"}]},
    {"code": "040000", "name": "宮城県", "areas": [{"code": "040010", "name": "東部"}, {"code": "040020", "name": "西部"}]},
    {"code": "050000", "name": "秋田県", "areas": [{"code": "050010", "name": "沿岸"}, {"code": "050020", "name": "内陸"}]},
    {"code": "060000", "name": "山形県", "areas": [{"code": "060010", "name": "村山"}, {"code": "060020", "name": "置賜"}, {"code": "060030", "name": "庄内"}, {"code": "060040", "name": "最上"}]},
    {"code": "070000", "name": "福島県", "areas": [{"code": "070010", "name": "中通り"}, {"code": "070020", "name": "浜通り"}, {"code": "070030", "name": "会津"}]},
    {"code": "080000", "name": "茨城県", "areas": [{"code": "080010", "name": "北部"}, {"code": "080020", "name": "南部"}]},
    {"code": "090000", "name": "栃木県", "areas": [{"code": "090010", "name": "南部"}, {"code": "090020", "name": "北部"}]},
    {"code": "100000", "name": "群馬県", "areas": [{"code": "100010", "name": "南部"}, {"code": "100020", "name": "北部"}]},
    {"code": "110000", "name": "埼玉県", "areas": [{"code": "110010", "name": "南部"}, {"code": "110020", "name": "北部"}, {"code": "110030", "name": "秩父地方"}]},
    {"code": "120000", "name": "千葉県", "areas": [{"code": "120010", "name": "北西部"}, {"code": "120020", "name": "北東部"}, {"code": "120030", "name": "南部"}]},
    {"code": "130000", "name": "東京都", "areas": [{"code": "130010", "name": "東京地方"}, {"code": "130020", "name": "伊豆諸島北部"}, {"code": "130030", "name": "伊豆諸島南部"}, {"code": "130040", "name": "小笠原諸島"}]},
    {"code": "140000", "name": "神奈川県", "areas": [{"code": "140010", "name": "東部"}, {"code": "140020", "name": "西部"}]},
    {"code": "150000", "name": "新潟県", "areas": [{"code": "150010", "name": "下越"}, {"code": "150020", "name": "中越"}, {"code": "150030", "name": "上越"}, {"code": "150040", "name": "佐渡"}]},
    {"code": "160000", "name": "富山県", "areas": [{"code": "160010", "name": "東部"}, {"code": "160020", "name": "西部"}]},
    {"code": "170000", "name": "石川県", "areas": [{"code": "170010", "name": "加賀"}, {"code": "170020", "name": "能登"}]},
    {"code": "180000", "name": "福井県", "areas": [{"code": "180010", "name": "嶺北"}, {"code": "180020", "name": "嶺南"}]},
    {"code": "190000", "name": "山梨県", "areas": [{"code": "190010", "name": "中・西部"}, {"code": "190020", "name": "東部・富士五湖"}]},
    {"code": "200000", "name": "長野県", "areas": [{"code": "200010", "name": "北部"}, {"code": "200020", "name": "中部"}, {"code": "200030", "name": "南部"}]},
    {"code": "210000", "name": "岐阜県", "areas": [{"code": "210010", "name": "美濃地方"}, {"code": "210020", "name": "飛騨地方"}]},
    {"code": "220000", "name": "静岡県", "areas": [{"code": "220010", "name": "中部"}, {"code": "220020", "name": "伊豆"}, {"code": "220030", "name": "東部"}, {"code": "220040", "name": "西部"}]},
    {"code": "230000", "name": "愛知県", "areas": [{"code": "230010", "name": "西部"}, {"code": "230020", "name": "東部"}]},
    {"code": "240000", "name": "三重県", "areas": [{"code": "240010", "name": "北中部"}, {"code": "240020", "name": "南部"}]},
    {"code": "250000", "name": "滋賀県", "areas": [{"code": "250010", "name": "南部"}, {"code": "250020", "name": "北部"}]},
    {"code": "260000", "name": "京都府", "areas": [{"code": "260010", "name": "南部"}, {"code": "260020", "name": "北部"}]},
    {"code": "270000", "name": "大阪府", "areas": [{"code": "270000", "name": "大阪府"}]},
    {"code": "280000", "name": "兵庫県", "areas": [{"code": "280010", "name": "南部"}, {"code": "280020", "name": "北部"}]},
    {"code": "290000", "name": "奈良県", "areas": [{"code": "290010", "name": "北部"}, {"code": "290020", "name": "南部"}]},
    {"code": "300000", "name": "和歌山県", "areas": [{"code": "300010", "name": "北部"}, {"code": "300020", "name": "南部"}]},
    {"code": "310000", "name": "鳥取県", "areas": [{"code": "310010", "name": "東部"}, {"code": "310020", "name": "中・西部"}]},
    {"code": "320000", "name": "島根県", "areas": [{"code": "320010", "name": "東部"}, {"code": "320020", "name": "西部"}, {"code": "320030", "name": "隠岐"}]},
    {"code": "330000", "name": "岡山県", "areas": [{"code": "330010", "name": "南部"}, {"code": "330020", "name": "北部"}]},
    {"code": "340000", "name": "広島県", "areas": [{"code": "340010", "name": "南部"}, {"code": "340020", "name": "北部"}]},
    {"code": "350000", "name": "山口県", "areas": [{"code": "350010", "name": "西部"}, {"code": "350020", "name": "中部"}, {"code": "350030", "name": "東部"}, {"code": "350040", "name": "北部"}]},
    {"code": "360000", "name": "徳島県", "areas": [{"code": "360010", "name": "北部"}, {"code": "360020", "name": "南部"}]},
    {"code": "370000", "name": "香川県", "areas": [{"code": "370000", "name": "香川県"}]},
    {"code": "380000", "name": "愛媛県", "areas": [{"code": "380010", "name": "中予"}, {"code": "380020", "name": "東予"}, {"code": "380030", "name": "南予"}]},
    {"code": "390000", "name": "高知県", "areas": [{"code": "390010", "name": "中部"}, {"code": "390020", "name": "東部"}, {"code": "390030", "name": "西部"}]},
    {"code": "400000", "name": "福岡県", "areas": [{"code": "400010", "name": "福岡地方"}, {"code": "400020", "name": "北九州地方"}, {"code": "400030", "name": "筑豊地方"}, {"code": "400040", "name": "筑後地方"}]},
    {"code": "410000", "name": "佐賀県", "areas": [{"code": "410010", "name": "南部"}, {"code": "410020", "name": "北部"}]},
    {"code": "420000", "name": "長崎県", "areas": [{"code": "420010", "name": "南部"}, {"code": "420020", "name": "北部"}, {"code": "420030", "name": "壱岐・対馬"}, {"code": "420040", "name": "五島"}]},
    {"code": "430000", "name": "熊本県", "areas": [{"code": "430010", "name": "熊本地方"}, {"code": "430020", "name": "阿蘇地方"}, {"code": "430030", "name": "天草・芦北地方"}, {"code": "430040", "name": "球磨地方"}]},
    {"code": "440000", "name": "大分県", "areas": [{"code": "440010", "name": "中部"}, {"code": "440020", "name": "北部"}, {"code": "440030", "name": "西部"}, {"code": "440040", "name": "南部"}]},
    {"code": "450000", "name": "宮崎県", "areas": [{"code": "450010", "name": "南部平野部"}, {"code": "450020", "name": "北部平野部"}, {"code": "450030", "name": "南部山沿い"}, {"code": "450040", "name": "北部山沿い"}]},
    {"code": "460040", "name": "奄美地方", "areas": [{"code": "460040", "name": "奄美地方"}]},
    {"code": "460100", "name": "鹿児島県（奄美地方除く）", "areas": [{"code": "460010", "name": "薩摩地方"}, {"code": "460020", "name": "大隅地方"}, {"code": "460030", "name": "種子島・屋久島地方"}]},
    {"code": "471000", "name": "沖縄本島地方", "areas": [{"code": "471010", "name": "本島中南部"}, {"code": "471020", "name": "本島北部"}, {"code": "471030", "name": "久米島"}]},
    {"code": "472000", "name": "大東島地方", "areas": [{"code": "472000", "name": "大東島地方"}]},
    {"code": "473000", "name": "宮古島地方", "areas": [{"code": "473000", "name": "宮古島地方"}]},
    {"code": "474000", "name": "八重山地方", "areas": [{"code": "474010", "name": "石垣島地方"}, {"code": "474020", "name": "与那国島地方"}]}
];

function officeIndex(code) {
    for (var i = 0; i < OFFICES.length; i++) {
        if (OFFICES[i].code === code) return i;
    }
    return -1;
}

function areaIndex(officeCode, areaCode) {
    var i = officeIndex(officeCode);
    if (i < 0) return -1;
    var as = OFFICES[i].areas;
    for (var j = 0; j < as.length; j++) {
        if (as[j].code === areaCode) return j;
    }
    return -1;
}

// 「北西部」「南部」だけではどこの話か分からないので予報区名を冠して返す。
// 予報区名と地域名が同じものが 7 件あるので、その場合は重ねない。
function displayName(officeCode, areaCode) {
    var i = officeIndex(officeCode);
    if (i < 0) return "";
    var office = OFFICES[i];
    // 「鹿児島県（奄美地方除く）」のような但し書きは長くなるだけなので落とす
    var prefix = office.name.replace(/（[^）]*）/g, "");
    var j = areaIndex(officeCode, areaCode);
    if (j < 0) return prefix;
    var area = office.areas[j].name;
    return area === prefix ? area : prefix + " - " + area;
}
