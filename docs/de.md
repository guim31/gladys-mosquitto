# Mosquitto

Überwacht den Zustand deines MQTT-Brokers **Eclipse Mosquitto** in Gladys: verbundene Clients,
Nachrichtenrate, Datenverkehr, Abonnements, Laufzeit, Version und Ausfälle, aus den Statistiken, die
Mosquitto unter seinen `$SYS`-Topics veröffentlicht.

Diese Integration steht in keiner Verbindung zur Eclipse Foundation oder zum Mosquitto-Projekt.

## Überblick

Gladys spricht bereits MQTT: Seine **MQTT**-Integration verbindet sich mit einem Broker, um deine
Geräte zu steuern (auch solche im Home-Assistant-Format wie Zigbee2MQTT). Statistiken des Brokers
selbst zeigt sie nicht. Diese Integration schon: Die Integration abonniert `$SYS/broker/#`, nur lesend, und macht
aus dem, was Mosquitto über sich selbst sagt, ein Gladys-Gerät, fünf Szenen-Auslöser, eine
Szenen-Aktion und ein Dashboard-Widget.

Die Integration veröffentlicht nie eine Nachricht und abonniert nichts außerhalb von `$SYS`. Alles bleibt in
deinem lokalen Netzwerk.

Die Integration kann den Broker überwachen, den Gladys für dich installiert hat (die Zugangsdaten stehen auf der
MQTT-Seite von Gladys), wie jeden anderen Mosquitto in deinem Netzwerk.

## Voraussetzungen

- Gladys 5.1 oder neuer.
- Mosquitto 1.6 oder neuer (getestet mit 2.1 und 1.6), von Gladys aus erreichbar.
- Ein Mosquitto-Benutzer, der `$SYS` lesen darf, oder anonymer Zugang, wenn dein Broker ihn erlaubt.
- `sys_interval` in `mosquitto.conf` nicht auf 0 (standardmäßig 10 Sekunden).

### Dem Benutzer Lesezugriff auf $SYS geben

Wenn dein Broker eine ACL-Datei nutzt (`acl_file` in `mosquitto.conf`), füge diese zwei Zeilen für den
Benutzer der Integration hinzu und starte Mosquitto neu:

```text
user gladys
topic read $SYS/#
```

Ersetze `gladys` durch deinen Benutzernamen. Ohne sie nimmt Mosquitto die Verbindung an, sendet aber
keine Statistiken: Die Seite der Integration zeigt dann genau die Zeilen, die fehlen. Ohne ACL-Datei
darf jeder Benutzer `$SYS` lesen.

## Konfiguration

1. Öffne den Tab **Konfiguration** der Integration.
2. **Adresse des Brokers**: `mqtt://` gefolgt vom Host und dem Port, wenn er nicht 1883 ist (zum
   Beispiel `mqtt://mosquitto.local:1883`). Für TLS nimm `mqtts://` (Port 8883). WebSocket-Adressen
   (`ws://`, `wss://`) gehen auch.
3. **Benutzername** und **Passwort**: Für einen anonymen Broker leer lassen.
4. **Selbstsigniertes Zertifikat akzeptieren**: Nur mit `mqtts://`, wenn das Zertifikat des Brokers
   nicht von einer bekannten Stelle signiert ist.
5. **Sprache der Texte**: die Namen der Funktionen beim Hinzufügen des Brokers, der Satz der
   Szenen-Aktion und die Meldungen der Aktion.
6. Speichern. Das Gerät **Mosquitto** erscheint im Tab **Erkennung**, sobald die ersten Statistiken
   da sind (innerhalb einer Sekunde): Füge es hinzu.

Die Schaltfläche **Verbindung prüfen** zeigt, ob der Broker antwortet, ob der Benutzer `$SYS` lesen
darf, sowie die Version und die Kennzahlen.

Die Integration verbindet sich mit einer einmal gezogenen und gespeicherten Client-ID
(`gladys-mosquitto-` gefolgt von acht Zeichen) und einer sauberen Sitzung: Die Integration zählt nicht zu den
getrennten persistenten Clients, wenn Gladys neu startet.

## Das Gerät des Brokers

| Funktion                      | Bedeutung                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------- |
| Erreichbar                    | 1, solange die Integration mit dem Broker verbunden ist, sonst 0                |
| Verbundene Clients            | Jetzt verbundene Clients, **diese Integration eingeschlossen**                  |
| Getrennte persistente Clients | Clients mit persistenter Sitzung (`clean session` aus), die offline sind        |
| Empfangene Nachrichten (/min) | Vom Broker empfangene Nachrichten pro Minute (gleitender Mittelwert, 1 Minute)  |
| Gesendete Nachrichten (/min)  | Vom Broker gesendete Nachrichten pro Minute                                     |
| Eingehender Datenverkehr      | Empfangene Bytes pro Sekunde (gleitender Mittelwert, 1 Minute)                  |
| Ausgehender Datenverkehr      | Gesendete Bytes pro Sekunde                                                     |
| Abonnements                   | Aktive Abonnements                                                              |
| Gespeicherte Nachrichten      | Vom Broker aufbewahrte Retained-Nachrichten                                     |
| Laufzeit                      | Zeit seit dem Start von Mosquitto, in Tagen                                     |
| Version                       | Version von Mosquitto, als Text                                                 |
| Belegter Speicher             | Von Mosquitto belegter Speicher, wenn er ihn meldet (nicht im 1.6-Docker-Image) |

Eine Funktion gibt es nur, wenn Mosquitto ihr Topic veröffentlicht: Manche Builds haben keine
Speicherangabe. Ist der Broker nicht erreichbar, geht **Erreichbar** auf 0 und die anderen Funktionen
behalten ihren letzten Wert.

Mosquitto aktualisiert seine Statistiken alle `sys_interval` Sekunden; Gladys bekommt geänderte Werte
höchstens alle 30 Sekunden, und **Erreichbar** sofort.

## Dashboard-Widget

Das Widget **Mosquitto-Broker** zeigt den Zustand des Brokers (online, nicht erreichbar, Anmeldung
abgelehnt, keine `$SYS`-Statistiken), seine Version und Laufzeit, dann vier Live-Kacheln: verbundene
Clients, empfangene und gesendete Nachrichten pro Minute, Abonnements. Wähle den Broker in den
Einstellungen des Widgets.

## Szenen-Auslöser

- **Broker nicht erreichbar**: Der Broker ist seit 1, 5, 15, 30 oder 60 Minuten (wählbar) nicht
  erreichbar. Ein Neustart von wenigen Sekunden löst nichts aus. Variable: die Anzahl der Minuten.
- **Broker wieder da**: Der Broker antwortet wieder nach einem Ausfall von mindestens einer Minute.
  Variable: die Dauer des Ausfalls.
- **Broker neu gestartet**: Die Laufzeit von Mosquitto ist auf null zurückgegangen. Er wurde neu
  gestartet (Update, Neustart des Rechners) oder ist abgestürzt, auch ohne sichtbaren Ausfall.
  Variable: die Version.
- **Weniger verbundene Clients**: weniger Clients als die gewählte Zahl (2 bis 100) während einer
  Minute: Ein Sensor, eine Bridge oder Zigbee2MQTT ist weg. Löst einmal aus, und erst wieder, wenn die
  Zahl zurück ist. Denk daran, dass die Integration als ein Client zählt.
- **Nachrichtenspitze**: mehr empfangene Nachrichten pro Minute als die gewählte Zahl (100 bis
  50.000): ein Gerät in einer Schleife, eine Flut. Höchstens einmal alle 30 Minuten pro Schwelle.

## Szenen-Aktion

**Zustand des Brokers** liefert einen fertigen Satz, zum Beispiel „Mosquitto 2.1.2 läuft seit 3
Tagen, 12 Clients verbunden, 64 Nachrichten empfangen und 87 gesendet pro Minute.“, und seine Zahlen:
erreichbar, verbundene Clients, empfangene und gesendete Nachrichten pro Minute, Laufzeit in Stunden,
Version.

## Ideen für Szenen

- **Zigbee2MQTT ist weg**: Auslöser „Weniger verbundene Clients“ unter 5, Aktion „Nachricht senden“
  mit der Zahl der Clients, um nach Zigbee2MQTT zu sehen.
- **Broker ausgefallen**: Auslöser „Broker nicht erreichbar“ seit 5 Minuten, Aktion „Nachricht
  senden“ — die per MQTT gesteuerten Lampen und Sensoren antworten nicht mehr.
- **Wochenbericht**: jeden Sonntag um 9:00 die Aktion „Zustand des Brokers“, dann „Nachricht senden“
  mit ihrem Satz.

## Fehlerbehebung

- **„Verbunden, aber keine $SYS-Statistiken“**: Die ACL lässt den Benutzer `$SYS` nicht lesen. Füge
  `topic read $SYS/#` unter dem Benutzer in der ACL-Datei hinzu (siehe Voraussetzungen) oder prüfe,
  dass `sys_interval` nicht 0 ist, und starte Mosquitto neu.
- **„Mosquitto lehnt die Verbindung ab“**: falscher Benutzername oder falsches Passwort, oder
  anonymer Zugang abgeschaltet.
- **„Der Mosquitto-Broker ist nicht erreichbar“**: Prüfe Adresse und Port, ob Mosquitto im Netzwerk
  lauscht (`listener 1883` bei Mosquitto 2, das ohne diese Zeile nur lokal lauscht) und bei
  `mqtts://` das Zertifikat (oder hake „Selbstsigniertes Zertifikat akzeptieren“ an).
- Mehr Details in den Protokollen der Integration; `LOG_LEVEL=debug` zeigt jeden Schritt.

## Grenzen

- Ein Broker pro Installation der Integration.
- Nur Mosquitto: Andere Broker (EMQX, VerneMQ, HiveMQ) veröffentlichen andere `$SYS`-Topics oder gar
  keine.
- Die Raten sind die gleitenden Mittelwerte, die Mosquitto selbst berechnet.
- Ein per Bridge mit anderen verbundener Broker zeigt nur seine eigenen Zahlen.
