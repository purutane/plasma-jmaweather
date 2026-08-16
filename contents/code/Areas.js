.pragma library
.import "AreasData.js" as Data

// 予報区・地域を引く。表そのもの（OFFICES）は生成物の AreasData.js にある。
// ここは手で書くので、区域の再編で表が入れ替わっても差分がロジックに紛れない。

// 設定画面のコンボボックスがモデルにそのまま使うので、名前を変えずに出す
var OFFICES = Data.OFFICES;

// area.json の予報区コードでは短期予報が 404 になる 2 件。気象庁は別のコードで
// 配信しているので読み替える。
//
// **警報では読み替えないこと。** 十勝 (014030) と奄美 (460040) は警報だと
// 自分のコードで配信されていて、読み替え先 (014100 / 460100) の警報 JSON には
// その地域が入っていない。読み替えるとこの 2 地域だけ警報が永久に出なくなる。
var REMAP = { "014030": "014100", "460040": "460100" };

function endpoint(officeCode) {
    return REMAP[officeCode] || officeCode;
}

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

// 地域コードは全国で一意なので、予報区をまたいで 1 件だけ見つかる。
// 予報区も観測所もここから取れるので、探し方はこの 1 本だけにしてある。
function lookup(areaCode) {
    for (var i = 0; i < OFFICES.length; i++) {
        var as = OFFICES[i].areas;
        for (var j = 0; j < as.length; j++) {
            if (as[j].code === areaCode) {
                return { office: OFFICES[i], area: as[j] };
            }
        }
    }
    return null;
}

// 地域コードから予報区を引き直す（Geo.js の逆引き用）
function officeOf(areaCode) {
    var hit = lookup(areaCode);
    return hit ? hit.office.code : "";
}

// 気温の観測所の候補。1 区域に複数割り当てられていることがあるので、
// 実際に配信に載っているものを呼ぶ側が選ぶ。
function stationsOf(areaCode) {
    var hit = lookup(areaCode);
    return hit ? hit.area.stations : [];
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
