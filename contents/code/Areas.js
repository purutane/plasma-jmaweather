.pragma library

// 気象庁 予報区一覧（common/const/area.json より生成）
// 気温の観測所は forecast/const/forecast_area.json より
// tools/generate_data.py が書き出すので手で編集しない

// 短期予報の配信コードが area.json と食い違う2件を補正する
var REMAP = { "014030": "014100", "460040": "460100" };

function endpoint(officeCode) {
    return REMAP[officeCode] || officeCode;
}

var OFFICES = [
    {"code": "011000", "name": "宗谷地方", "areas": [{"code": "011000", "name": "宗谷地方", "stations": ["11016"]}]},
    {"code": "012000", "name": "上川・留萌地方", "areas": [{"code": "012010", "name": "上川地方", "stations": ["12442"]}, {"code": "012020", "name": "留萌地方", "stations": ["13277"]}]},
    {"code": "013000", "name": "網走・北見・紋別地方", "areas": [{"code": "013010", "name": "網走地方", "stations": ["17341"]}, {"code": "013020", "name": "北見地方", "stations": ["17521"]}, {"code": "013030", "name": "紋別地方", "stations": ["17112"]}]},
    {"code": "014030", "name": "十勝地方", "areas": [{"code": "014030", "name": "十勝地方", "stations": ["20432"]}]},
    {"code": "014100", "name": "釧路・根室地方", "areas": [{"code": "014010", "name": "根室地方", "stations": ["18273"]}, {"code": "014020", "name": "釧路地方", "stations": ["19432"]}]},
    {"code": "015000", "name": "胆振・日高地方", "areas": [{"code": "015010", "name": "胆振地方", "stations": ["21323"]}, {"code": "015020", "name": "日高地方", "stations": ["22327"]}]},
    {"code": "016000", "name": "石狩・空知・後志地方", "areas": [{"code": "016010", "name": "石狩地方", "stations": ["14163"]}, {"code": "016020", "name": "空知地方", "stations": ["15356"]}, {"code": "016030", "name": "後志地方", "stations": ["16217"]}]},
    {"code": "017000", "name": "渡島・檜山地方", "areas": [{"code": "017010", "name": "渡島地方", "stations": ["23232"]}, {"code": "017020", "name": "檜山地方", "stations": ["24217"]}]},
    {"code": "020000", "name": "青森県", "areas": [{"code": "020010", "name": "津軽", "stations": ["31312", "31436", "31461"]}, {"code": "020020", "name": "下北", "stations": ["31111"]}, {"code": "020030", "name": "三八上北", "stations": ["31602"]}]},
    {"code": "030000", "name": "岩手県", "areas": [{"code": "030010", "name": "内陸", "stations": ["33431", "33071", "33911"]}, {"code": "030020", "name": "沿岸北部", "stations": ["33472"]}, {"code": "030030", "name": "沿岸南部", "stations": ["33877"]}]},
    {"code": "040000", "name": "宮城県", "areas": [{"code": "040010", "name": "東部", "stations": ["34392", "34292", "34216"]}, {"code": "040020", "name": "西部", "stations": ["34461"]}]},
    {"code": "050000", "name": "秋田県", "areas": [{"code": "050010", "name": "沿岸", "stations": ["32402"]}, {"code": "050020", "name": "内陸", "stations": ["32126", "32596"]}]},
    {"code": "060000", "name": "山形県", "areas": [{"code": "060010", "name": "村山", "stations": ["35426"]}, {"code": "060020", "name": "置賜", "stations": ["35552"]}, {"code": "060030", "name": "庄内", "stations": ["35052"]}, {"code": "060040", "name": "最上", "stations": ["35162"]}]},
    {"code": "070000", "name": "福島県", "areas": [{"code": "070010", "name": "中通り", "stations": ["36127", "36667", "36476"]}, {"code": "070020", "name": "浜通り", "stations": ["36846", "36151"]}, {"code": "070030", "name": "会津", "stations": ["36361", "36641"]}]},
    {"code": "080000", "name": "茨城県", "areas": [{"code": "080010", "name": "北部", "stations": ["40201"]}, {"code": "080020", "name": "南部", "stations": ["40341"]}]},
    {"code": "090000", "name": "栃木県", "areas": [{"code": "090010", "name": "南部", "stations": ["41277"]}, {"code": "090020", "name": "北部", "stations": ["41141"]}]},
    {"code": "100000", "name": "群馬県", "areas": [{"code": "100010", "name": "南部", "stations": ["42251"]}, {"code": "100020", "name": "北部", "stations": ["42091"]}]},
    {"code": "110000", "name": "埼玉県", "areas": [{"code": "110010", "name": "南部", "stations": ["43241"]}, {"code": "110020", "name": "北部", "stations": ["43056"]}, {"code": "110030", "name": "秩父地方", "stations": ["43156"]}]},
    {"code": "120000", "name": "千葉県", "areas": [{"code": "120010", "name": "北西部", "stations": ["45212"]}, {"code": "120020", "name": "北東部", "stations": ["45148"]}, {"code": "120030", "name": "南部", "stations": ["45401"]}]},
    {"code": "130000", "name": "東京都", "areas": [{"code": "130010", "name": "東京地方", "stations": ["44132"]}, {"code": "130020", "name": "伊豆諸島北部", "stations": ["44172"]}, {"code": "130030", "name": "伊豆諸島南部", "stations": ["44263"]}, {"code": "130040", "name": "小笠原諸島", "stations": ["44301"]}]},
    {"code": "140000", "name": "神奈川県", "areas": [{"code": "140010", "name": "東部", "stations": ["46106"]}, {"code": "140020", "name": "西部", "stations": ["46166"]}]},
    {"code": "150000", "name": "新潟県", "areas": [{"code": "150010", "name": "下越", "stations": ["54232", "54421"]}, {"code": "150020", "name": "中越", "stations": ["54501", "54841"]}, {"code": "150030", "name": "上越", "stations": ["54651"]}, {"code": "150040", "name": "佐渡", "stations": ["54157"]}]},
    {"code": "160000", "name": "富山県", "areas": [{"code": "160010", "name": "東部", "stations": ["55102"]}, {"code": "160020", "name": "西部", "stations": ["55091"]}]},
    {"code": "170000", "name": "石川県", "areas": [{"code": "170010", "name": "加賀", "stations": ["56227"]}, {"code": "170020", "name": "能登", "stations": ["56052"]}]},
    {"code": "180000", "name": "福井県", "areas": [{"code": "180010", "name": "嶺北", "stations": ["57066", "57121"]}, {"code": "180020", "name": "嶺南", "stations": ["57248"]}]},
    {"code": "190000", "name": "山梨県", "areas": [{"code": "190010", "name": "中・西部", "stations": ["49142"]}, {"code": "190020", "name": "東部・富士五湖", "stations": ["49251"]}]},
    {"code": "200000", "name": "長野県", "areas": [{"code": "200010", "name": "北部", "stations": ["48156"]}, {"code": "200020", "name": "中部", "stations": ["48361", "48491", "48331"]}, {"code": "200030", "name": "南部", "stations": ["48767"]}]},
    {"code": "210000", "name": "岐阜県", "areas": [{"code": "210010", "name": "美濃地方", "stations": ["52586"]}, {"code": "210020", "name": "飛騨地方", "stations": ["52146"]}]},
    {"code": "220000", "name": "静岡県", "areas": [{"code": "220010", "name": "中部", "stations": ["50331"]}, {"code": "220020", "name": "伊豆", "stations": ["50281", "50561"]}, {"code": "220030", "name": "東部", "stations": ["50206"]}, {"code": "220040", "name": "西部", "stations": ["50456", "50551"]}]},
    {"code": "230000", "name": "愛知県", "areas": [{"code": "230010", "name": "西部", "stations": ["51106"]}, {"code": "230020", "name": "東部", "stations": ["51331"]}]},
    {"code": "240000", "name": "三重県", "areas": [{"code": "240010", "name": "北中部", "stations": ["53133", "53061", "53112"]}, {"code": "240020", "name": "南部", "stations": ["53378"]}]},
    {"code": "250000", "name": "滋賀県", "areas": [{"code": "250010", "name": "南部", "stations": ["60216"]}, {"code": "250020", "name": "北部", "stations": ["60131"]}]},
    {"code": "260000", "name": "京都府", "areas": [{"code": "260010", "name": "南部", "stations": ["61286"]}, {"code": "260020", "name": "北部", "stations": ["61111"]}]},
    {"code": "270000", "name": "大阪府", "areas": [{"code": "270000", "name": "大阪府", "stations": ["62078"]}]},
    {"code": "280000", "name": "兵庫県", "areas": [{"code": "280010", "name": "南部", "stations": ["63518", "63576", "63571", "63383"]}, {"code": "280020", "name": "北部", "stations": ["63051"]}]},
    {"code": "290000", "name": "奈良県", "areas": [{"code": "290010", "name": "北部", "stations": ["64036"]}, {"code": "290020", "name": "南部", "stations": ["64227"]}]},
    {"code": "300000", "name": "和歌山県", "areas": [{"code": "300010", "name": "北部", "stations": ["65042"]}, {"code": "300020", "name": "南部", "stations": ["65356"]}]},
    {"code": "310000", "name": "鳥取県", "areas": [{"code": "310010", "name": "東部", "stations": ["69122"]}, {"code": "310020", "name": "中・西部", "stations": ["69076"]}]},
    {"code": "320000", "name": "島根県", "areas": [{"code": "320010", "name": "東部", "stations": ["68132"]}, {"code": "320020", "name": "西部", "stations": ["68376"]}, {"code": "320030", "name": "隠岐", "stations": ["68022"]}]},
    {"code": "330000", "name": "岡山県", "areas": [{"code": "330010", "name": "南部", "stations": ["66408"]}, {"code": "330020", "name": "北部", "stations": ["66186"]}]},
    {"code": "340000", "name": "広島県", "areas": [{"code": "340010", "name": "南部", "stations": ["67437", "67511", "67401"]}, {"code": "340020", "name": "北部", "stations": ["67116"]}]},
    {"code": "350000", "name": "山口県", "areas": [{"code": "350010", "name": "西部", "stations": ["81428"]}, {"code": "350020", "name": "中部", "stations": ["81286"]}, {"code": "350030", "name": "東部", "stations": ["81481"]}, {"code": "350040", "name": "北部", "stations": ["81071"]}]},
    {"code": "360000", "name": "徳島県", "areas": [{"code": "360010", "name": "北部", "stations": ["71106", "71066"]}, {"code": "360020", "name": "南部", "stations": ["71266"]}]},
    {"code": "370000", "name": "香川県", "areas": [{"code": "370000", "name": "香川県", "stations": ["72086"]}]},
    {"code": "380000", "name": "愛媛県", "areas": [{"code": "380010", "name": "中予", "stations": ["73166"]}, {"code": "380020", "name": "東予", "stations": ["73136", "73141"]}, {"code": "380030", "name": "南予", "stations": ["73442"]}]},
    {"code": "390000", "name": "高知県", "areas": [{"code": "390010", "name": "中部", "stations": ["74182"]}, {"code": "390020", "name": "東部", "stations": ["74372"]}, {"code": "390030", "name": "西部", "stations": ["74516"]}]},
    {"code": "400000", "name": "福岡県", "areas": [{"code": "400010", "name": "福岡地方", "stations": ["82182"]}, {"code": "400020", "name": "北九州地方", "stations": ["82056"]}, {"code": "400030", "name": "筑豊地方", "stations": ["82136"]}, {"code": "400040", "name": "筑後地方", "stations": ["82306"]}]},
    {"code": "410000", "name": "佐賀県", "areas": [{"code": "410010", "name": "南部", "stations": ["85142"]}, {"code": "410020", "name": "北部", "stations": ["85116"]}]},
    {"code": "420000", "name": "長崎県", "areas": [{"code": "420010", "name": "南部", "stations": ["84496"]}, {"code": "420020", "name": "北部", "stations": ["84266"]}, {"code": "420030", "name": "壱岐・対馬", "stations": ["84072"]}, {"code": "420040", "name": "五島", "stations": ["84536"]}]},
    {"code": "430000", "name": "熊本県", "areas": [{"code": "430010", "name": "熊本地方", "stations": ["86141"]}, {"code": "430020", "name": "阿蘇地方", "stations": ["86111"]}, {"code": "430030", "name": "天草・芦北地方", "stations": ["86491"]}, {"code": "430040", "name": "球磨地方", "stations": ["86467"]}]},
    {"code": "440000", "name": "大分県", "areas": [{"code": "440010", "name": "中部", "stations": ["83216"]}, {"code": "440020", "name": "北部", "stations": ["83051"]}, {"code": "440030", "name": "西部", "stations": ["83137"]}, {"code": "440040", "name": "南部", "stations": ["83401"]}]},
    {"code": "450000", "name": "宮崎県", "areas": [{"code": "450010", "name": "南部平野部", "stations": ["87376", "87492"]}, {"code": "450020", "name": "北部平野部", "stations": ["87141"]}, {"code": "450030", "name": "南部山沿い", "stations": ["87426"]}, {"code": "450040", "name": "北部山沿い", "stations": ["87041"]}]},
    {"code": "460040", "name": "奄美地方", "areas": [{"code": "460040", "name": "奄美地方", "stations": ["88837", "88971"]}]},
    {"code": "460100", "name": "鹿児島県（奄美地方除く）", "areas": [{"code": "460010", "name": "薩摩地方", "stations": ["88317", "88061", "88466"]}, {"code": "460020", "name": "大隅地方", "stations": ["88442"]}, {"code": "460030", "name": "種子島・屋久島地方", "stations": ["88612"]}]},
    {"code": "471000", "name": "沖縄本島地方", "areas": [{"code": "471010", "name": "本島中南部", "stations": ["91197"]}, {"code": "471020", "name": "本島北部", "stations": ["91107"]}, {"code": "471030", "name": "久米島", "stations": ["91146"]}]},
    {"code": "472000", "name": "大東島地方", "areas": [{"code": "472000", "name": "大東島地方", "stations": ["92011"]}]},
    {"code": "473000", "name": "宮古島地方", "areas": [{"code": "473000", "name": "宮古島地方", "stations": ["93041"]}]},
    {"code": "474000", "name": "八重山地方", "areas": [{"code": "474010", "name": "石垣島地方", "stations": ["94081"]}, {"code": "474020", "name": "与那国島地方", "stations": ["94017"]}]}
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

// 地域コードは全国で一意なので、そこから予報区を引き直せる（Geo.js の逆引き用）
function officeOf(areaCode) {
    for (var i = 0; i < OFFICES.length; i++) {
        var as = OFFICES[i].areas;
        for (var j = 0; j < as.length; j++) {
            if (as[j].code === areaCode) return OFFICES[i].code;
        }
    }
    return "";
}

// 気温の観測所の候補。1 区域に複数割り当てられていることがあるので、
// 実際に配信に載っているものを呼ぶ側が選ぶ。
function stationsOf(areaCode) {
    for (var i = 0; i < OFFICES.length; i++) {
        var as = OFFICES[i].areas;
        for (var j = 0; j < as.length; j++) {
            if (as[j].code === areaCode) return as[j].stations;
        }
    }
    return [];
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
