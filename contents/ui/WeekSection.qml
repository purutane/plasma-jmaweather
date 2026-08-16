import QtQuick
import QtQuick.Layouts
import org.kde.plasma.components as PlasmaComponents
import org.kde.kirigami as Kirigami

import "../code/Forecast.js" as Forecast
import "../code/Telops.js" as Telops

// 明日以降の予報。主役の日（TodaySection）より後ろの日だけを並べる。
ColumnLayout {
    id: section

    // Forecast.parse() の結果
    property var parsed: null
    // 主役として既に出している日。これより後ろだけをここに出す
    property var today: null

    readonly property var days: parsed && today
        ? parsed.order.filter(function (d) { return d > section.today.date; })
        : []

    spacing: Kirigami.Units.smallSpacing

    Repeater {
        model: section.days

        delegate: RowLayout {
            required property var modelData
            readonly property var day: section.parsed.days[modelData]

            Layout.fillWidth: true
            spacing: Kirigami.Units.smallSpacing

            PlasmaComponents.Label {
                text: Forecast.shortDate(day.date)
                Layout.preferredWidth: Kirigami.Units.gridUnit * 4
            }

            Kirigami.Icon {
                source: day.code ? Telops.icon(day.code, false) : "weather-none-available"
                implicitWidth: Kirigami.Units.iconSizes.smallMedium
                implicitHeight: Kirigami.Units.iconSizes.smallMedium
            }

            PlasmaComponents.Label {
                text: day.label || "–"
                elide: Text.ElideRight
                Layout.fillWidth: true
            }

            PlasmaComponents.Label {
                text: Forecast.popText(day.pop)
                horizontalAlignment: Text.AlignRight
                opacity: 0.8
                Layout.preferredWidth: Kirigami.Units.gridUnit * 2.5
            }

            PlasmaComponents.Label {
                text: Forecast.tempText(day.tmax)
                color: Kirigami.Theme.negativeTextColor
                horizontalAlignment: Text.AlignRight
                Layout.preferredWidth: Kirigami.Units.gridUnit * 2
            }

            PlasmaComponents.Label {
                text: Forecast.tempText(day.tmin)
                color: Kirigami.Theme.linkColor
                horizontalAlignment: Text.AlignRight
                Layout.preferredWidth: Kirigami.Units.gridUnit * 2
            }
        }
    }
}
