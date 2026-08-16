import QtQuick
import QtQuick.Layouts
import org.kde.plasma.components as PlasmaComponents
import org.kde.kirigami as Kirigami

// 気象庁の概況（overview_forecast）。取れないこともあるので、空なら丸ごと畳む。
ColumnLayout {
    id: section

    property string overview: ""

    spacing: Kirigami.Units.smallSpacing
    visible: section.overview !== ""

    Kirigami.Separator { Layout.fillWidth: true }

    PlasmaComponents.Label {
        text: "概況"
        font: Kirigami.Theme.smallFont
        opacity: 0.7
    }

    PlasmaComponents.Label {
        text: section.overview
        wrapMode: Text.WordWrap
        font: Kirigami.Theme.smallFont
        opacity: 0.9
        Layout.fillWidth: true
    }
}
