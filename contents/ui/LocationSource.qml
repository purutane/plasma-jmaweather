import QtQuick

import "../code/Locate.js" as Locate
import "../code/Geo.js" as Geo
import "../code/Areas.js" as Areas

// IP から現在地を判定して予報区・地域まで落とす。
// 定期判定（main.qml）と再判定ボタン（ConfigGeneral.qml）の両方から使うので、
// 通信の段取りはここ 1 箇所に置いてある。
QtObject {
    id: source

    property bool busy: false

    signal resolved(string officeCode, string areaCode)
    signal failed(string message)

    function detect() {
        if (busy) {
            return;
        }
        busy = true;
        tryProvider(0);
    }

    // 候補を上から試す。読めない・区域まで落とせないときだけ次へ送る。
    function tryProvider(index) {
        if (index >= Locate.PROVIDERS.length) {
            source.busy = false;
            source.failed("現在地を判定できませんでした");
            return;
        }

        var xhr = new XMLHttpRequest();
        xhr.open("GET", Locate.PROVIDERS[index].url);
        xhr.onreadystatechange = function () {
            if (xhr.readyState !== XMLHttpRequest.DONE) {
                return;
            }

            var location = null;
            if (xhr.status === 200) {
                try {
                    location = Locate.readLocation(JSON.parse(xhr.responseText));
                } catch (e) {
                    location = null;
                }
            }

            // 国外と読めたなら別のサービスに聞き直しても同じなので、そこで打ち切る
            if (location && location.country && location.country !== "JP") {
                source.busy = false;
                source.failed("日本国外の接続元と判定されました（" + location.country + "）");
                return;
            }

            var hit = Locate.resolve(location, Geo.POINTS);
            var office = hit ? Areas.officeOf(hit.areaCode) : "";
            if (office === "") {
                source.tryProvider(index + 1);
                return;
            }

            source.busy = false;
            source.resolved(office, hit.areaCode);
        };
        xhr.send();
    }
}
