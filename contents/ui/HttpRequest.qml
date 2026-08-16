import QtQuick

// JSON を 1 本取ってくる。予報・概況・警報（main.qml）と現在地の問い合わせ
// （LocationSource.qml）で同じ段取りを使う。
//
// **見張りの Timer を外さないこと。** QML の XMLHttpRequest はタイムアウトを
// 持たないので、接続だけ張られて応答が返らない相手に当たると
// onreadystatechange が二度と呼ばれない。呼んだ側は busy を戻せず、更新ボタンや
// 再判定ボタンが無効のまま固まる。切断・DNS 失敗は status 0 の DONE で返って
// くるのでこの見張りには掛からず、掛かるのは「繋がったまま黙っている」場合だけ。
QtObject {
    id: request

    // 気象庁の JSON はどれも数十 KB。これだけ待って返らなければ諦めて、
    // 次の定期更新（既定 30 分）に任せる。
    property int timeoutMs: 20000

    // 送信中の XMLHttpRequest。打ち切ったかどうかの判定にも使うので、
    // 終わったら必ず null に戻す。
    property var xhr: null
    readonly property bool busy: xhr !== null

    signal loaded(var json)
    signal failed(string message)

    property Timer watchdog: Timer {
        interval: request.timeoutMs
        onTriggered: request.timedOut()
    }

    function get(url) {
        cancel();

        var x = new XMLHttpRequest();
        request.xhr = x;
        x.onreadystatechange = function () {
            // 打ち切った後に届いた通知は捨てる（abort() でも DONE が来る）
            if (x.readyState !== XMLHttpRequest.DONE || request.xhr !== x) {
                return;
            }
            request.xhr = null;
            request.watchdog.stop();

            if (x.status !== 200) {
                request.failed("取得に失敗しました (HTTP " + x.status + ")");
                return;
            }
            var json;
            try {
                json = JSON.parse(x.responseText);
            } catch (e) {
                request.failed("応答を解析できませんでした: " + e);
                return;
            }
            // 解析は try の外で通知する。受け取った側の例外まで
            // 「解析できませんでした」に化けさせない。
            request.loaded(json);
        };
        request.watchdog.restart();
        x.open("GET", url);
        x.send();
    }

    // 黙って止めるだけ。失敗の通知はしない（呼び直す側が続きを決める）
    function cancel() {
        watchdog.stop();
        if (request.xhr) {
            var x = request.xhr;
            request.xhr = null;
            x.abort();
        }
    }

    function timedOut() {
        if (!request.xhr) {
            return;
        }
        cancel();
        request.failed("応答がありません");
    }
}
