# Mosquitto

Surveille la santé de votre broker MQTT **Eclipse Mosquitto** dans Gladys : clients connectés, débit
de messages, trafic, abonnements, durée de fonctionnement, version et pannes, à partir des
statistiques que Mosquitto publie sur ses sujets `$SYS`.

Cette intégration n'est affiliée ni à la fondation Eclipse ni au projet Mosquitto.

## Présentation

Gladys parle déjà MQTT : son intégration **MQTT** se connecte à un broker pour piloter vos appareils
(y compris ceux annoncés au format Home Assistant, comme Zigbee2MQTT). Elle n'affiche aucune
statistique du broker lui-même. Cette intégration, si : elle s'abonne à `$SYS/broker/#`, en lecture
seule, et fait de ce que Mosquitto dit de lui-même un appareil Gladys, cinq déclencheurs de scène, une
action de scène et un widget de tableau de bord.

Elle ne publie jamais de message et ne s'abonne à rien en dehors de `$SYS`. Tout reste sur votre
réseau local.

Elle peut surveiller le broker que Gladys a installé pour vous (les identifiants sont sur la page MQTT
de Gladys) comme n'importe quel autre Mosquitto de votre réseau.

## Prérequis

- Gladys 5.1 ou plus récent.
- Mosquitto 1.6 ou plus récent (testé avec la 2.1 et la 1.6), joignable depuis Gladys.
- Un utilisateur Mosquitto autorisé à lire `$SYS`, ou l'accès anonyme si votre broker le permet.
- `sys_interval` différent de 0 dans `mosquitto.conf` (10 secondes par défaut).

### Autoriser l'utilisateur à lire $SYS

Si votre broker utilise un fichier ACL (`acl_file` dans `mosquitto.conf`), ajoutez ces deux lignes
pour l'utilisateur de l'intégration, puis redémarrez Mosquitto :

```text
user gladys
topic read $SYS/#
```

Remplacez `gladys` par votre nom d'utilisateur. Sans elles, Mosquitto accepte la connexion mais
n'envoie aucune statistique : la page de l'intégration affiche alors les lignes exactes à ajouter.
Sans fichier ACL, tous les utilisateurs peuvent lire `$SYS`.

## Configuration

1. Ouvrez l'onglet **Configuration** de l'intégration.
2. **Adresse du broker** : `mqtt://` suivi de l'hôte, et du port s'il n'est pas 1883 (par exemple
   `mqtt://mosquitto.local:1883`). Pour TLS, utilisez `mqtts://` (port 8883). Les adresses WebSocket
   (`ws://`, `wss://`) fonctionnent aussi.
3. **Nom d'utilisateur** et **Mot de passe** : laissez vide pour un broker anonyme.
4. **Accepter un certificat auto-signé** : seulement avec `mqtts://`, quand le certificat du broker
   n'est pas signé par une autorité connue.
5. **Langue des textes** : les noms des fonctionnalités à l'ajout du broker, la phrase de l'action de
   scène et les messages de l'action.
6. Enregistrez. L'appareil **Mosquitto** apparaît dans l'onglet **Découverte** dès les premières
   statistiques (en une seconde) : ajoutez-le.

Le bouton **Vérifier la connexion** indique si le broker répond, si l'utilisateur peut lire `$SYS`, et
affiche la version et les chiffres clés.

L'intégration se connecte avec un identifiant client tiré une fois pour toutes et conservé
(`gladys-mosquitto-` suivi de huit caractères), et une session propre : elle ne compte pas parmi les
clients persistants déconnectés quand Gladys redémarre.

## L'appareil du broker

| Fonctionnalité                  | Signification                                                                     |
| ------------------------------- | --------------------------------------------------------------------------------- |
| Joignable                       | 1 tant que l'intégration est connectée au broker, 0 sinon                         |
| Clients connectés               | Clients connectés en ce moment, **cette intégration comprise**                    |
| Clients persistants déconnectés | Clients à session persistante (`clean session` désactivé) hors ligne              |
| Messages reçus (/min)           | Messages reçus par le broker par minute (moyenne glissante sur 1 minute)          |
| Messages envoyés (/min)         | Messages envoyés par le broker par minute                                         |
| Trafic entrant                  | Octets reçus par seconde (moyenne glissante sur 1 minute)                         |
| Trafic sortant                  | Octets envoyés par seconde                                                        |
| Abonnements                     | Abonnements actifs                                                                |
| Messages retenus                | Messages retenus (`retained`) gardés par le broker                                |
| Durée de fonctionnement         | Temps depuis le démarrage de Mosquitto, en jours                                  |
| Version                         | Version de Mosquitto, en texte                                                    |
| Mémoire utilisée                | Mémoire utilisée par Mosquitto, quand il la publie (pas l'image Docker de la 1.6) |

Une fonctionnalité n'existe que si Mosquitto publie son sujet : certaines compilations n'ont pas de
chiffre de mémoire. Quand le broker est injoignable, **Joignable** passe à 0 et les autres
fonctionnalités gardent leur dernière valeur.

Mosquitto rafraîchit ses statistiques toutes les `sys_interval` secondes ; Gladys reçoit les valeurs
changées au plus toutes les 30 secondes, et **Joignable** aussitôt.

## Widget de tableau de bord

Le widget **Broker Mosquitto** affiche l'état du broker (en ligne, injoignable, connexion refusée, pas
de statistiques `$SYS`), sa version et sa durée de fonctionnement, puis quatre tuiles en direct :
clients connectés, messages reçus et envoyés par minute, abonnements. Choisissez le broker dans les
réglages du widget.

## Déclencheurs de scène

- **Broker injoignable** : le broker est injoignable depuis 1, 5, 15, 30 ou 60 minutes (au choix). Un
  redémarrage de quelques secondes ne déclenche rien. Variable : le nombre de minutes.
- **Broker revenu** : le broker répond de nouveau après une coupure d'au moins une minute. Variable :
  la durée de la coupure.
- **Broker redémarré** : la durée de fonctionnement de Mosquitto est revenue à zéro. Il a redémarré
  (mise à jour, redémarrage de la machine) ou planté, même sans coupure visible. Variable : la
  version.
- **Moins de clients connectés** : moins de clients que le nombre choisi (de 2 à 100) pendant une
  minute : un capteur, un pont ou Zigbee2MQTT a décroché. Se déclenche une fois, puis seulement après
  le retour du nombre de clients. L'intégration compte pour un client.
- **Pic de messages** : plus de messages reçus par minute que le nombre choisi (de 100 à 50 000) : un
  appareil qui boucle, une avalanche. Au plus une fois toutes les 30 minutes par seuil.

## Action de scène

**État du broker** donne une phrase toute faite, par exemple « Mosquitto 2.1.2 fonctionne depuis 3
jours, 12 clients connectés, 64 messages reçus et 87 envoyés par minute. », et ses chiffres :
joignable, clients connectés, messages reçus et envoyés par minute, durée de fonctionnement en heures,
version.

## Idées de scènes

- **Zigbee2MQTT a décroché** : déclencheur « Moins de clients connectés » sous 5, action « Envoyer un
  message » avec le nombre de clients, pour aller voir Zigbee2MQTT.
- **Broker en panne** : déclencheur « Broker injoignable » depuis 5 minutes, action « Envoyer un
  message » — les lampes et capteurs pilotés en MQTT ne répondent plus.
- **Bilan de la semaine** : chaque dimanche à 9 h, action « État du broker », puis « Envoyer un
  message » avec sa phrase.

## Dépannage

- **« Connecté, mais aucune statistique $SYS »** : l'ACL ne laisse pas l'utilisateur lire `$SYS`.
  Ajoutez `topic read $SYS/#` sous l'utilisateur dans le fichier ACL (voir Prérequis), ou vérifiez
  que `sys_interval` ne vaut pas 0, puis redémarrez Mosquitto.
- **« Mosquitto refuse la connexion »** : nom d'utilisateur ou mot de passe faux, ou accès anonyme
  désactivé.
- **« Le broker Mosquitto est injoignable »** : vérifiez l'adresse et le port, que Mosquitto écoute
  sur le réseau (`listener 1883` avec Mosquitto 2, qui n'écoute qu'en local sans cette ligne), et
  pour `mqtts://` le certificat (ou cochez « Accepter un certificat auto-signé »).
- Plus de détails dans les journaux de l'intégration ; `LOG_LEVEL=debug` montre chaque étape.

## Limites

- Un seul broker par installation de l'intégration.
- Mosquitto seulement : les autres brokers (EMQX, VerneMQ, HiveMQ) publient d'autres sujets `$SYS`,
  ou aucun.
- Les débits sont les moyennes glissantes calculées par Mosquitto lui-même.
- Un broker relié à d'autres par un pont n'affiche que ses propres chiffres.
