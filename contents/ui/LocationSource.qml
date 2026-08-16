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
    // 今どの候補を試しているか。応答が返ってから次へ送るのに要る。
    property int index: 0

    signal resolved(string officeCode, string areaCode)
    signal failed(string message)

    property HttpRequest request: HttpRequest {
        onLoaded: function (json) {
            source.handle(Locate.readLocation(json));
        }

        // 読めない相手は候補ごと諦めて次へ送る（時間切れもここに来る）
        onFailed: function (message) {
            source.handle(null);
        }
    }

    function detect() {
        if (busy) {
            return;
        }
        busy = true;
        tryProvider(0);
    }

    // 候補を上から試す。読めない・区域まで落とせないときだけ次へ送る。
    function tryProvider(i) {
        if (i >= Locate.PROVIDERS.length) {
            source.busy = false;
            source.failed("現在地を判定できませんでした");
            return;
        }
        source.index = i;
        request.get(Locate.PROVIDERS[i].url);
    }

    function handle(location) {
        // 国外と読めたなら別のサービスに聞き直しても同じなので、そこで打ち切る
        if (location && location.country && location.country !== "JP") {
            source.busy = false;
            source.failed("日本国外の接続元と判定されました（" + location.country + "）");
            return;
        }

        var hit = Locate.resolve(location, Geo.POINTS);
        var office = hit ? Areas.officeOf(hit.areaCode) : "";
        if (office === "") {
            source.tryProvider(source.index + 1);
            return;
        }

        source.busy = false;
        source.resolved(office, hit.areaCode);
    }
}
