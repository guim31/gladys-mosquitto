# Mosquitto

Vigila la salud de su broker MQTT **Eclipse Mosquitto** en Gladys: clientes conectados, mensajes por
minuto, tráfico, suscripciones, tiempo en marcha, versión y caídas, a partir de las estadísticas que
Mosquitto publica en sus temas `$SYS`.

Esta integración no está afiliada a la Fundación Eclipse ni al proyecto Mosquitto.

## Presentación

Gladys ya habla MQTT: su integración **MQTT** se conecta a un broker para controlar sus dispositivos
(incluidos los anunciados en el formato de Home Assistant, como Zigbee2MQTT). No muestra ninguna
estadística del propio broker. Esta integración sí: se suscribe a `$SYS/broker/#`, solo en lectura, y
convierte lo que Mosquitto dice de sí mismo en un dispositivo de Gladys, cinco disparadores de escena,
una acción de escena y un widget del panel.

Nunca publica un mensaje y no se suscribe a nada fuera de `$SYS`. Todo se queda en su red local.

Puede vigilar el broker que Gladys instaló para usted (las credenciales están en la página MQTT de
Gladys) igual que cualquier otro Mosquitto de su red.

## Requisitos

- Gladys 5.1 o posterior.
- Mosquitto 1.6 o posterior (probado con 2.1 y 1.6), accesible desde Gladys.
- Un usuario de Mosquitto autorizado a leer `$SYS`, o el acceso anónimo si su broker lo permite.
- `sys_interval` distinto de 0 en `mosquitto.conf` (10 segundos por defecto).

### Dar al usuario acceso de lectura a $SYS

Si su broker usa un archivo ACL (`acl_file` en `mosquitto.conf`), añada estas dos líneas para el
usuario de la integración y reinicie Mosquitto:

```text
user gladys
topic read $SYS/#
```

Sustituya `gladys` por su nombre de usuario. Sin ellas, Mosquitto acepta la conexión pero no envía
ninguna estadística: la página de la integración muestra entonces las líneas exactas que hay que
añadir. Sin archivo ACL, todos los usuarios pueden leer `$SYS`.

## Configuración

1. Abra la pestaña **Configuración** de la integración.
2. **Dirección del broker**: `mqtt://` seguido del host, y del puerto si no es 1883 (por ejemplo
   `mqtt://mosquitto.local:1883`). Para TLS, use `mqtts://` (puerto 8883). Las direcciones WebSocket
   (`ws://`, `wss://`) también funcionan.
3. **Nombre de usuario** y **Contraseña**: déjelos vacíos para un broker anónimo.
4. **Aceptar un certificado autofirmado**: solo con `mqtts://`, cuando el certificado del broker no
   está firmado por una autoridad conocida.
5. **Idioma de los textos**: los nombres de las funciones al añadir el broker, la frase de la acción de
   escena y los mensajes de la acción.
6. Guarde. El dispositivo **Mosquitto** aparece en la pestaña **Descubrimiento** en cuanto llegan las
   primeras estadísticas (en un segundo): añádalo.

El botón **Comprobar la conexión** indica si el broker responde, si el usuario puede leer `$SYS`, y
muestra la versión y las cifras clave.

La integración se conecta con un identificador de cliente elegido una vez y conservado
(`gladys-mosquitto-` seguido de ocho caracteres), y una sesión limpia: no cuenta entre los clientes
persistentes desconectados cuando Gladys se reinicia.

## El dispositivo del broker

| Función                             | Significado                                                                 |
| ----------------------------------- | --------------------------------------------------------------------------- |
| Accesible                           | 1 mientras la integración está conectada al broker, 0 si no                 |
| Clientes conectados                 | Clientes conectados ahora mismo, **incluida esta integración**              |
| Clientes persistentes desconectados | Clientes con sesión persistente (`clean session` desactivado) desconectados |
| Mensajes recibidos (/min)           | Mensajes recibidos por el broker por minuto (media móvil de 1 minuto)       |
| Mensajes enviados (/min)            | Mensajes enviados por el broker por minuto                                  |
| Tráfico entrante                    | Bytes recibidos por segundo (media móvil de 1 minuto)                       |
| Tráfico saliente                    | Bytes enviados por segundo                                                  |
| Suscripciones                       | Suscripciones activas                                                       |
| Mensajes retenidos                  | Mensajes retenidos (`retained`) que guarda el broker                        |
| Tiempo en marcha                    | Tiempo desde el arranque de Mosquitto, en días                              |
| Versión                             | Versión de Mosquitto, en texto                                              |
| Memoria usada                       | Memoria usada por Mosquitto, cuando la publica (no en la imagen Docker 1.6) |

Una función solo existe si Mosquitto publica su tema: algunas compilaciones no tienen dato de memoria.
Cuando el broker es inaccesible, **Accesible** pasa a 0 y las demás funciones conservan su último
valor.

Mosquitto actualiza sus estadísticas cada `sys_interval` segundos; Gladys recibe los valores cambiados
como mucho cada 30 segundos, y **Accesible** de inmediato.

## Widget del panel

El widget **Broker Mosquitto** muestra el estado del broker (en línea, inaccesible, conexión
rechazada, sin estadísticas `$SYS`), su versión y su tiempo en marcha, y luego cuatro mosaicos en
directo: clientes conectados, mensajes recibidos y enviados por minuto, suscripciones. Elija el broker
en los ajustes del widget.

## Disparadores de escena

- **Broker inaccesible**: el broker está inaccesible desde hace 1, 5, 15, 30 o 60 minutos (a elegir).
  Un reinicio de unos segundos no activa nada. Variable: el número de minutos.
- **Broker de vuelta**: el broker vuelve a responder tras una caída de al menos un minuto. Variable: la
  duración de la caída.
- **Broker reiniciado**: el tiempo en marcha de Mosquitto volvió a cero. Se reinició (actualización,
  reinicio de la máquina) o falló, incluso sin caída visible. Variable: la versión.
- **Menos clientes conectados**: menos clientes que el número elegido (de 2 a 100) durante un minuto:
  un sensor, un puente o Zigbee2MQTT se desconectó. Se activa una vez, y de nuevo solo cuando el número
  se ha recuperado. Tenga en cuenta que la integración cuenta como un cliente.
- **Pico de mensajes**: más mensajes recibidos por minuto que el número elegido (de 100 a 50.000): un
  dispositivo en bucle, una avalancha. Como mucho una vez cada 30 minutos por umbral.

## Acción de escena

**Estado del broker** da una frase lista, por ejemplo «Mosquitto 2.1.2 lleva en marcha 3 días, 12
clientes conectados, 64 mensajes recibidos y 87 enviados por minuto.», y sus cifras: accesible,
clientes conectados, mensajes recibidos y enviados por minuto, tiempo en marcha en horas, versión.

## Ideas de escenas

- **Zigbee2MQTT se desconectó**: disparador «Menos clientes conectados» por debajo de 5, acción
  «Enviar un mensaje» con el número de clientes, para revisar Zigbee2MQTT.
- **Broker caído**: disparador «Broker inaccesible» desde hace 5 minutos, acción «Enviar un mensaje»
  — las luces y sensores controlados por MQTT ya no responden.
- **Informe semanal**: cada domingo a las 9:00, acción «Estado del broker» y luego «Enviar un mensaje»
  con su frase.

## Solución de problemas

- **«Conectado, pero sin estadísticas $SYS»**: la ACL no deja al usuario leer `$SYS`. Añada
  `topic read $SYS/#` bajo el usuario en el archivo ACL (vea Requisitos), o compruebe que
  `sys_interval` no vale 0, y reinicie Mosquitto.
- **«Mosquitto rechaza la conexión»**: nombre de usuario o contraseña incorrectos, o acceso anónimo
  desactivado.
- **«No se puede acceder al broker Mosquitto»**: compruebe la dirección y el puerto, que Mosquitto
  escucha en la red (`listener 1883` con Mosquitto 2, que sin esa línea solo escucha en local), y para
  `mqtts://` el certificado (o marque «Aceptar un certificado autofirmado»).
- Más detalles en los registros de la integración; `LOG_LEVEL=debug` muestra cada paso.

## Límites

- Un solo broker por instalación de la integración.
- Solo Mosquitto: los demás brokers (EMQX, VerneMQ, HiveMQ) publican otros temas `$SYS`, o ninguno.
- Los ritmos son las medias móviles que calcula el propio Mosquitto.
- Un broker conectado a otros por un puente solo muestra sus propias cifras.
