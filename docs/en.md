# Mosquitto

Watches the health of your **Eclipse Mosquitto** MQTT broker in Gladys: connected clients, message
rates, traffic, subscriptions, uptime, version, and outages, from the statistics Mosquitto publishes
on its `$SYS` topics.

This integration is not affiliated with the Eclipse Foundation or the Mosquitto project.

## Overview

Gladys already speaks MQTT: its **MQTT** integration connects to a broker to drive your devices
(including those announced in the Home Assistant format, such as Zigbee2MQTT). It shows no statistics
of the broker itself. This integration does: it subscribes to `$SYS/broker/#`, read-only, and turns
what Mosquitto says about itself into a Gladys device, five scene triggers, a scene action and a
dashboard widget.

It never publishes a message and never subscribes to anything outside `$SYS`. Everything stays on
your local network.

It can watch the broker Gladys installed for you (the credentials are on the MQTT page of Gladys) as
well as any other Mosquitto on your network.

## Requirements

- Gladys 5.1 or later.
- Mosquitto 1.6 or later (tested with 2.1 and 1.6), reachable from Gladys.
- A Mosquitto user allowed to read `$SYS`, or anonymous access if your broker allows it.
- `sys_interval` not set to 0 in `mosquitto.conf` (10 seconds by default).

### Give the user read access to $SYS

If your broker uses an ACL file (`acl_file` in `mosquitto.conf`), add these two lines for the user of
the integration, then restart Mosquitto:

```text
user gladys
topic read $SYS/#
```

For anonymous access, put `topic read $SYS/#` at the top of the file, before any `user` line. Replace `gladys` with your user name. Without them, Mosquitto accepts the connection but sends no
statistics: the integration page then shows the exact lines to add. Without an ACL file, every user
can read `$SYS`.

## Configuration

1. Open the **Configuration** tab of the integration.
2. **Broker address**: `mqtt://` followed by the host, and the port if it is not 1883 (for example
   `mqtt://mosquitto.local:1883`). For TLS, use `mqtts://` (port 8883). WebSocket addresses
   (`ws://`, `wss://`) work too.
3. **User name** and **Password**: leave empty for an anonymous broker.
4. **Accept a self-signed certificate**: only with `mqtts://`, when the certificate of the broker is
   not signed by a known authority.
5. **Language of the texts**: the names of the features when the broker is added, the sentence of the
   scene action and the messages of the action.
6. Save. The **Mosquitto** device appears in the **Discovery** tab once the first statistics arrived
   (within a second): add it.

The **Check the connection** button tells whether the broker answers, whether the user may read
`$SYS`, and shows the version and the key numbers.

The integration connects with a client id drawn once and kept (`gladys-mosquitto-` followed by eight
characters), and a clean session: it does not count among the disconnected persistent clients when
Gladys restarts.

## The broker device

| Feature                         | Meaning                                                                  |
| ------------------------------- | ------------------------------------------------------------------------ |
| Reachable                       | 1 while the broker answers (even if it refuses the login), 0 otherwise   |
| Connected clients               | Clients connected right now, **this integration included**               |
| Disconnected persistent clients | Clients with a persistent session (`clean session` off) that are offline |
| Messages received (/min)        | Messages published to the broker per minute (1-minute moving average)    |
| Messages sent (/min)            | Messages delivered by the broker to subscribers per minute               |
| Incoming traffic                | Bytes received per second (1-minute moving average)                      |
| Outgoing traffic                | Bytes sent per second                                                    |
| Subscriptions                   | Active subscriptions                                                     |
| Retained messages               | Retained messages kept by the broker                                     |
| Uptime                          | Time since Mosquitto started, in days                                    |
| Version                         | Version of Mosquitto, as text                                            |
| Memory used                     | Memory used by Mosquitto, when it reports it (not the 1.6 Docker image)  |

A feature only exists if Mosquitto publishes its topic: some builds have no memory figure. Mosquitto 1.6 sends some figures only once they change: such a feature appears later, and the Discovery tab then offers to update the device. When the
broker cannot be reached, **Reachable** goes to 0 and the other features keep their last value.

Mosquitto refreshes its statistics every `sys_interval` seconds; Gladys receives the changed values
at most every 30 seconds, and **Reachable** at once.

## Dashboard widget

The **Mosquitto broker** widget shows the state of the broker (online, unreachable, login refused, no
`$SYS` statistics), its version and uptime, then four live tiles: connected clients, messages
received and sent per minute, subscriptions. Pick the broker in the widget settings.

## Scene triggers

- **Broker unreachable**: the broker has been unreachable for 1, 5, 15, 30 or 60 minutes (to choose).
  A restart of a few seconds fires nothing, nor does a refused login. Variable: the number of minutes.
- **Broker back**: the broker answers again after an outage of at least one minute. Variable: the
  duration of the outage.
- **Broker restarted**: the uptime of Mosquitto went back to zero. It restarted (update, reboot) or
  crashed, even if no outage was seen. Variable: the version.
- **Fewer connected clients**: fewer clients than the chosen number (2 to 100) for one minute: a
  sensor, a bridge or Zigbee2MQTT dropped. Fires once, and again only after the count came back.
  Remember that the integration counts as one client.
- **Message spike**: more messages published per minute than the chosen number (100 to 50,000): a
  device in a loop, a flood. At most once every 30 minutes per threshold; a flood still going on after 30 minutes is reported again.

## Scene action

**Broker summary** gives a ready-made sentence, for example "Mosquitto 2.1.2 has been running for 3
days, 12 clients connected, 64 messages received and 87 sent per minute.", and its numbers: reachable,
connected clients, messages received and sent per minute, uptime in hours, version.

## Scene ideas

- **Zigbee2MQTT dropped**: trigger "Fewer connected clients" below 5, action "Send a message" with the
  number of clients, to check Zigbee2MQTT.
- **Broker down**: trigger "Broker unreachable" for 5 minutes, action "Send a message" — the lights
  and sensors driven over MQTT no longer answer.
- **Weekly report**: every Sunday at 9:00, action "Broker summary", then "Send a message" with its
  sentence.

## Troubleshooting

- **"Connected, but no $SYS statistics"**: the ACL does not let the user read `$SYS`. Add
  `topic read $SYS/#` under the user in the ACL file (see Requirements), or check that
  `sys_interval` is not 0, then restart Mosquitto.
- **"Mosquitto refused the connection"**: wrong user name or password, or anonymous access disabled.
- **"The Mosquitto broker cannot be reached"**: check the address and the port, that Mosquitto
  listens on the network (`listener 1883` in Mosquitto 2, which only listens locally without it), and
  for `mqtts://` the certificate (or tick "Accept a self-signed certificate").
- More details in the integration logs; `LOG_LEVEL=debug` shows every step.

## Limits

- One broker per installation of the integration.
- Mosquitto only: other brokers (EMQX, VerneMQ, HiveMQ) publish different `$SYS` topics, or none.
- The rates are the moving averages computed by Mosquitto itself.
- A broker bridged to others shows its own figures only.
