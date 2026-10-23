# `$SYS` captures

`mosquitto_sub -v -t '$SYS/broker/#'`, by a user allowed to read `$SYS`, on the official images,
23/10/2026:

- `mosquitto-2.1.2.txt`: `eclipse-mosquitto:2` (2.1.2), `sys_interval 10`, with a publisher (one
  retained message a second) and a subscriber running: the retained burst received at subscription,
  then one refresh (only the values that changed).
- `mosquitto-1.6.15.txt`: `eclipse-mosquitto:1.6`, idle: the retained burst only. No `heap/*`.

Both brokers ran with a password file and an ACL: a second user without `topic read $SYS/#` was
granted the subscription (SUBACK 0) and received nothing, the case `src/mosquitto/client.js` calls
"denied". Nothing here identifies a real installation.
