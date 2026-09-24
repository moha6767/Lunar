# Lunar 2.3.9

## Robuste Videowiedergabe 2.3.9

- Lunar erkennt zusätzlich FLV, TS, MTS, M2TS, MPG, MPEG, VOB, OGV und 3GP.
- Nicht direkt von Chromium unterstützte Formate werden einmalig per FFmpeg in einen separaten Wiedergabe-Cache umgewandelt; die Originaldatei bleibt unverändert.
- Scheitert ein nativ geöffnetes MP4, M4V oder WebM an seinem Codec, startet automatisch derselbe kompatible MP4-Fallback.

## Einzelvideo-Import 2.3.0

- Unter **Videokurs auswählen** besitzt jeder gespeicherte Kurs die Aktion **+ Video**.
- Ein YouTube-Video-Link wird direkt in den ausgewählten Kurs geladen und danach automatisch in der Kursansicht ergänzt.
- Der Import läuft über die vorhandene Warteschlange im Hintergrund; bestehende Videos und Lernfortschritte bleiben erhalten.

## Vollständige Laufzeitanzeige 2.2.1

- Fehlt eine gespeicherte Videolaufzeit, liest Lunar sie beim Kursscan direkt und schnell aus dem Dateikopf aus.
- Unbekannte Laufzeiten werden mit bis zu fünf parallelen, rein lesenden Prüfungen ergänzt und anschließend im normalen Kurszustand gespeichert.
- Das bisherige `…` im Zeit-Badge wurde entfernt. Nur eine tatsächlich gelesene Laufzeit wird eingeblendet; bei einer beschädigten oder nicht lesbaren Datei bleibt das Badge sauber verborgen.
- YouTube-Metadaten bleiben die erste Quelle, sodass bereits bekannte Laufzeiten nicht unnötig erneut geprüft werden.

## Visuelle Importliste 2.0.5

- Die redundante Beschriftung **Import-Warteschlange** wurde entfernt; übrig bleibt nur die knappe Anzahl aktiver oder wartender Einträge.
- Sobald YouTube eine Playlist gelesen hat, zeigt ihr Eintrag das Playlist- beziehungsweise erste Video-Thumbnail und den echten Playlistnamen.
- Noch nicht gelesene wartende Links besitzen eine hochwertige orange YouTube-Vorschau statt eines leeren Platzhalters.
- Jede Importkarte zeigt Status, aktuellen Arbeitsschritt, Prozentwert und einen eigenen Fortschrittsbalken in einem größeren Liquid-Glass-Layout.
- Thumbnails und Titel werden live während der Metadatenphase an die Oberfläche übertragen und bleiben auch im letzten Importstatus sichtbar.

## Zweistufige Kursreparatur 2.0.4

- **Kurs aktualisieren** prüft zuerst jede vorhandene Datei auf eine echte Bild- und Tonspur.
- Videos ohne Ton oder ohne Bild werden in **Phase 1/2** zuerst gezielt nachgeladen und anschließend erneut geprüft.
- Erst danach vergleicht **Phase 2/2** die echten YouTube-Playlist-Positionen mit den vollständig vorhandenen Videos und lädt ausschließlich komplett fehlende Einträge.
- Vollständige Videos werden nicht erneut geladen. Gelöschte, private und dadurch nicht fortlaufende YouTube-Positionen werden nicht fälschlich als Lücke behandelt.
- Die Importanzeige nennt währenddessen klar **Bild/Ton** oder **Fehlend**, einschließlich laufender Teilnummer.

## Kompakte Symbolleiste und Kursraster 2.0.3

- **Fehlendes prüfen** wurde vollständig entfernt. Die automatische Bild-/Ton-Reparatur und der gezielte YouTube-Abgleich bleiben zentral unter **Kurs aktualisieren**.
- Alle Fortschrittsangaben und Balken im Fenster **Videokurs auswählen** sitzen unabhängig von der Titellänge auf derselben unteren Höhe.
- Kalender, Warteschlange, Kursaktualisierung und Designumschaltung verwenden einheitliche 40×40-Symbolbuttons.
- Die Warteschlange ist im Ruhezustand neutral und leuchtet während eines laufenden oder wartenden Imports orange.
- **Kurs aktualisieren** zeigt während der Prüfung ein rotierendes Ladesymbol. Die Designumschaltung zeigt im hellen Design den Mond und im dunklen Design die Sonne.

## Klare Importdiagnose 2.0.2

- Bei 96 Prozent zeigt Lunar ausdrücklich an, dass Bild und Ton zusammengeführt und die fertige MP4 geprüft werden. Dieser lokale Schritt kann bei langen Videos mehrere Minuten benötigen.
- Teilweise fehlgeschlagene Kurse erscheinen orange als **IMPORT PRÜFEN** und nennen, wie viele Videos fehlen oder unvollständig sind. Harte Fehler bleiben als roter Importhinweis sichtbar.
- Erfolgs-, Teilfehler- und Fehlermeldungen bleiben in der Importhistorie erhalten und öffnen den betroffenen Kurs direkt.
- **Ordner auswählen** und **YouTube-Playlist** bewegen beim Hover nur noch Symbol und Pfeil. Text und gesamte Auswahlfläche werden nicht transformiert und bleiben dadurch scharf.

## Automatic Bild-/Ton-Reparatur 2.0.1

- **Kurs aktualisieren** erkennt getrennte YouTube-Bild- und Tonspuren und führt sie lokal zu einer geprüften MP4 zusammen.
- Ein Video zählt erst als fertig, wenn die Datei tatsächlich eine Bild- und eine Tonspur enthält.
- Bei YouTube-Kursen werden anschließend nur unvollständige oder fehlende Playlist-Einträge freigegeben und gezielt nachgeladen; vollständige Videos bleiben unangetastet.
- Alte technische Dateien mit Endungen wie `.f137.mp4` und `.f251-8.webm` werden auch mit zusätzlichen yt-dlp-Suffixen zuverlässig gepaart.
- Audio-only-Fallbacks sind für normale Videokurse ausgeschlossen. Die grauen Flächen der Quellenauswahl und beide weißen Lichteffekte der Fortschrittskarte wurden entfernt.

## Clean hero glass 2.0.0

- Der separate weiße Lichtfleck am oberen Rand der großen Fortschrittskarte wurde entfernt.
- Glasfläche, Farben, Fortschrittsring und sämtliche Hover-Animationen bleiben unverändert.

## Borderless course gallery 1.7.1

- Der vorherige gemeinsame Designstand wird als **Lunar 1.7.0** geführt; diese Korrekturrunde ist Version 1.7.1.
- Inputs, Auswahlfelder, Primär-, Sekundär-, Icon- und Fortschrittsbuttons sowie kleine Zähler besitzen keine hellen 1-Pixel-Konturen mehr.
- Der Button **Videokurs auswählen** verändert beim Hover nicht mehr seine Größe. Text bleibt während der gesamten Licht- und Schattenanimation scharf.
- Das Auswahlfenster zeigt Videokurse als große, responsive Thumbnail-Galerie mit vier, drei, zwei oder einer Spalte – abhängig von der Fensterbreite.
- Vorschaubild, Kurstitel und Fortschritt bilden eine visuelle Einheit. Pfadangaben wurden in der Galerie ausgeblendet; der Entfernen-Button schwebt direkt auf dem Thumbnail.

## Smoked Glass refinement 1.4.20

- Glasfenster besitzen nun eine gleichmäßige, rauchige Fläche und eine dünne umlaufende Kontur statt heller Ober- und dunkler Unterkanten.
- Die Videokarte bewegt sich beim Hover weiterhin, skaliert aber nicht mehr als Ganzes. Titel und Metadaten bleiben dadurch scharf; nur das Thumbnail zoomt weich.
- Das Fenster **Videokurs auswählen** ist proportional größer, einschließlich Abständen, Quellkarten, Vorschaubildern und Text.
- Der Leuchtschein des Prozent-Rings darf über den SVG-Rahmen hinauslaufen und wird nicht mehr in einem sichtbaren Rechteck abgeschnitten.
- Schließen-Buttons verwenden ein präzises SVG-X in einer abgerundeten Glaskachel. Der Reset-Button besitzt im dunklen Design einen klareren, warmroten Glaszustand.

## Interactive Liquid Glass 1.4.19

- Alle Buttons besitzen jetzt ein einheitliches Hover-, Fokus- und Klickverhalten: leichtes Anheben, weichere Schatten und einen bewegten Glasreflex.
- Primär-, Sekundär-, Icon-, Schließen-, Kalender-, Warteschlangen- und Gefahrenbuttons verwenden ein gemeinsames modernes Form- und Animationssystem.
- Videokarten, Kursquellen, gespeicherte Kurse und Kalendertage reagieren ebenfalls sichtbar und flüssig auf den Mauszeiger.
- Gespeicherte Kurse zeigen bevorzugt das Thumbnail des ersten verfügbaren Videos. Nur wenn kein Bild existiert, bleibt das farbige Ordner- oder YouTube-Emoji sichtbar.
- Nutzer mit aktivierter Einstellung „Animationen reduzieren“ erhalten dieselben Zustände ohne Bewegungsanimationen.

## Liquid Glass & portable YouTube-Engine 1.4.18

- Das Orange bleibt erhalten; Karten, Fenster und Hintergründe nutzen jetzt einen moderneren Liquid-Glass-Look mit weicheren Lichtkanten und Tiefen.
- Die bisher grüne Farbe für angesehenen Fortschritt wurde durch einen Orange-Violett-Verlauf ersetzt.
- Ordner, YouTube-Playlisten und gespeicherte Kurse besitzen farbige Emoji-Symbole.
- **Videokurs importieren** öffnet dieselbe Importzentrale wie der Status **Import läuft**, einschließlich Warteschlange und aktuellem Fortschritt.
- Nach dem Vorbild von ClipGrab kann Lunar `yt-dlp` als portable Einzeldatei im Lunar-Datenordner laden. Scheitert die Python-Paketinstallation, läuft der Import damit ohne erneuten Pip-Aufbau weiter.
- Die bereitgestellte ClipGrab-EXE wurde vollständig untersucht. ClipGrab verwendet ebenfalls Python, `yt-dlp`, Deno und ffmpeg; proprietäre ClipGrab-Oberfläche und veraltete Binärdateien wurden deshalb nicht blind in Lunar kopiert.

Lokale Windows-App für passives Lernen mit mehreren Videokursen, dauerhaftem Fortschritt, YouTube-Playlists und Lernkalender.

## Neu in 1.3

- Neuer **Lernkalender** über den Kalender-Button oben rechts.
- Lunar protokolliert die tatsächlich in der App abgespielte Lernzeit pro Tag.
- Tagesansicht mit Lernzeit, angesehenen Videos, abgeschlossenen Videos und den zugehörigen Kursen.
- Monatsübersicht und 14-Tage-Verlauf zeigen, an welchen Tagen du wie viel gelernt hast.
- Der Lernkalender läuft **kursübergreifend**: Wechsel zwischen Kursen löscht weder Fortschritt noch Tagesstatistik.
- Fortschritt und Kalenderdaten liegen gemeinsam dauerhaft in `%USERPROFILE%\Videos\Lunar\lunar-library.json`.
- Beim Speichern der Wiedergabe werden nur die seit dem letzten Speichern tatsächlich abgespielten Bereiche als Tageslernzeit protokolliert. Vorspulen zählt nicht als Lernzeit.
- Manuell nachgetragener Fortschritt wird im Tagesverlauf als **MANUELL** markiert und nicht als aktive Wiedergabezeit ausgegeben.
- Automatisches Weiterspielen zum nächsten Video bleibt erhalten.

## Speicherort

Lunar verwendet als festen Stammordner:

`C:\Users\DEIN-NAME\Videos\Lunar\`

Darin liegen unter anderem:

- `Courses` – empfohlener Ort für deine Videokurse und automatisches Ziel für YouTube-Playlists
- `lunar-library.json` – Kurse, Videofortschritt und Lernkalender
- `youtube-engine.json` – letzter erfolgreicher Check der lokalen YouTube-Engine
- `yt-dlp-cache` – kleiner technischer Cache für schnellere wiederholte YouTube-Abfragen
- `lunar-library.json.backup` – stündliche Sicherung deiner Bibliothek

Vorhandene Kurse **müssen nicht** nach `Videos\Lunar\Courses` verschoben werden. Über **Videokurs auswählen → Ordner auswählen** kann Lunar auch Kurse an anderen Orten verwenden. Für eine aufgeräumte Bibliothek ist `Videos\Lunar\Courses` aber der empfohlene Ort.

## YouTube-Playlist

Unter **Videokurs auswählen → YouTube-Playlist** kannst du einen Playlist-Link einfügen. Lunar speichert den Kurs automatisch unter `Videos\Lunar\Courses` als `Playlistname - Kanalname` und behält mit `001`, `002`, `003` usw. die Playlist-Reihenfolge bei.

Lunar verwendet automatisch die Cookies aus Firefox. Öffne YouTube in Firefox und melde dich dort an; eine separate `cookies.txt` ist nicht erforderlich.

### Einmalige Einrichtung

1. yt-dlp aktualisieren und Version prüfen:

   ```powershell
   yt-dlp -U
   yt-dlp --version
   ```

2. Deno installieren. Danach das Terminal und Lunar vollständig schließen und neu öffnen:

   ```powershell
   winget install DenoLand.Deno
   deno --version
   ```

3. YouTube in Firefox öffnen und mit dem gewünschten Konto anmelden.

### Direkte Befehle zur Diagnose

Ein Video:

```powershell
yt-dlp "https://www.youtube.com/watch?v=VIDEO_ID" --cookies-from-browser firefox --remote-components ejs
```

Eine Playlist:

```powershell
yt-dlp "https://www.youtube.com/playlist?list=PLAYLIST_ID" --cookies-from-browser firefox --remote-components ejs
```

Beispiel-Playlist:

```powershell
yt-dlp "https://www.youtube.com/playlist?list=PLwsNb3pVKommE9CvkF9BBI6G44055q3bj" --cookies-from-browser firefox --remote-components ejs
```

Ausführliche Diagnose:

```powershell
yt-dlp -vU "https://www.youtube.com/watch?v=0lVEWtLkLTI" --cookies-from-browser firefox --remote-components ejs
```

Der Ablauf lautet: **YouTube → Firefox-Login/Cookies → yt-dlp → Deno → EJS-Solver → Download**.

## Starten

`start.bat` doppelklicken.

## Windows-Installer bauen

`build-windows-exe.bat` doppelklicken. Danach liegt der Installer unter:

`dist\Lunar-Setup-2.3.0.exe`


## Lunar 1.4.1

- Getrennte Aktionen: **Videokurs importieren** und **Videokurs auswählen**.
- Gespeicherte Videokurse können aus Lunar entfernt werden; die Videodateien bleiben unangetastet.
- Kalender-, Kurs- und Videofenster öffnen/schließen weich statt mit hartem Übergang.
- Scrollen bleibt möglich, sichtbare Scrollbars sind appweit ausgeblendet.
- Der falsche sichtbare Leerzustand bei bereits geladenem Kurs ist behoben.
- Lunar nutzt vorhandene SF-Pro-/Segoe-UI-Variable-Schriften direkt vom System, wenn sie installiert sind.
- Das `LOCAL`-Badge wurde entfernt.

- Bereits vorhandene JPG/PNG/WebP-Thumbnails neben Videos werden direkt erkannt und unverändert direkt aus dem Kursordner verwendet.


## YouTube-Import 1.4.2

- Lunar prüft `yt-dlp`, `yt-dlp-ejs` und den integrierten ffmpeg-Fallback beim ersten Import sowie danach höchstens alle drei Tage. Eine funktionierende Installation wird nicht durch einen kurzfristigen Paket- oder Netzwerkfehler blockiert.
- Der Import nutzt für Metadaten und Videos dieselbe neue Verbindung: Firefox-Login-Cookies, Deno als JavaScript-Runtime und den offiziellen EJS-Challenge-Solver (`ejs:github`).
- YouTube-Thumbnails werden mit dem jeweiligen Video gespeichert und direkt von dort angezeigt – ohne Kopie in einen zweiten Thumbnail-Ordner. Die Dateinamen beginnen weiterhin mit `001`, `002`, `003` usw. und behalten dadurch die Playlist-Reihenfolge.
- Die neue Standardqualität **Smart · bis 1080p** spart gegenüber 1440p/4K viel Platz. Bei Bedarf kannst du 720p oder 1440p direkt vor dem Import wählen.
- **Hörbücher · Audio + Thumbnail** lädt die kleinste verständliche Audiospur und erstellt daraus mit dem jeweiligen YouTube-Thumbnail ein platzsparendes MP4. Das Audio wird dabei nicht neu kodiert.
- Bei lokal ausgewählten Videokurs-Ordnern erzeugt Lunar automatisch ein Windows-artiges Vorschaubild direkt aus jedem Video, wenn keine passende Bilddatei vorhanden ist.
- Jeder Kurs besitzt sein eigenes Download-Archiv. Dasselbe Video kann dadurch in unterschiedlichen Playlists korrekt erscheinen; ein abgebrochener Kurs kann später sicher fortgesetzt werden.
- Einzelne private, gelöschte oder gesperrte Playlist-Videos brechen den restlichen Kurs nicht mehr ab. Falls gar kein Video geladen werden kann, zeigt Lunar die Ursache verständlich an statt nur eines allgemeinen Fehlercodes.
- Fehlt ein System-ffmpeg, versucht Lunar automatisch den integrierten ffmpeg-Fallback. Ein Import lässt sich außerdem direkt in Lunar abbrechen; bereits vollständig geladene Videos bleiben erhalten.

## Hintergrund-Queue 1.4.3

- Mehrere YouTube-Playlisten können direkt hintereinander vorgemerkt werden. Lunar lädt immer nur eine Playlist gleichzeitig: Das schont Bandbreite, CPU, Arbeitsspeicher und Speicherplatz und ist bei langen Kursen deutlich robuster als parallele yt-dlp-Prozesse.
- Das × im Importfenster schließt nur den Dialog. Der aktive Import und die restliche Warteschlange laufen im Hintergrund weiter.
- Oben in Lunar erscheint ein kompakter Importstatus. Ein Klick darauf öffnet die Warteschlange mit Fortschritt, wartenden Playlisten sowie der letzten erfolgreichen oder fehlgeschlagenen Imports.
- Während ein Import läuft, bleiben gespeicherte Kurse frei auswählbar und Videos abspielbar. Ein fertig importierter Kurs übernimmt den gerade geöffneten Kurs nicht ungefragt.
- Wartende Playlisten können aus der Warteschlange entfernt werden; fertige Imports lassen sich dort direkt öffnen.
- Alle Schließen-Buttons verwenden jetzt einen eigenen, exakt mittig ausgerichteten Icon-Container.

## Medienbereinigung 1.4.4

- Dateien wie `.f137` und `.f251` sind keine Werbung. YouTube liefert bei höherer Qualität oft Bild und Ton getrennt; Lunar fügt sie jetzt zu einer einzigen, normalen MP4 zusammen.
- Bereits vorhandene technische Streams bleiben sichtbar, solange keine überprüfte MP4 mit Bild **und** Ton existiert. So kann ein Kurs niemals durch eine fehlgeschlagene Reparatur „verschwinden“.
- Erst eine erfolgreiche Zusammenführung entfernt die technischen Einzelstreams. Temporäre Lunar-Dateien mit `.tmp` werden dagegen immer ausgeblendet.
- Hat ein Kurs nur einen Abschnitt, wird die Kapitel-Kachel ausgeblendet und über dem Videoraster kein unnötiger Einzel-Kapitelkopf angezeigt.

## Sichtbarkeits-Schutz 1.4.5

- Ein technischer YouTube-Stream wird nie mehr vorsorglich aus der Kursansicht ausgeblendet. Wenn das Zusammenfügen nicht gelingt, bleiben die ursprünglichen Dateien sichtbar – genau wie vor der Medienbereinigung.
- Dadurch zeigt Lunar wieder alle vorhandenen Kursmedien an, statt nur die wenigen bereits fertig zusammengefügten Videos.

## Direkte Kursmedien 1.4.6

- Lunar nutzt pro Karte das bereits neben dem Video gespeicherte YouTube-Thumbnail direkt aus dem jeweiligen Kurs- oder Kapitelordner. Ein zweiter Lunar-Thumbnail-Cache wird nicht mehr aufgebaut.
- Der langsame Durchlauf, der für jedes Video erst Metadaten las und bei fehlendem Bild ein eigenes Standbild erzeugte, entfällt. Bilder laden nur noch bei sichtbaren Karten.
- Die sichtbaren Titel werden aus dem Dateinamen bereinigt: `001 - Titel.f137.mp4` erscheint als `Titel` mit einer kleinen `1` als Reihenfolgenummer.
- Audio-only-Dateien wie `.f251` werden nicht mehr als eigene Videokarte angezeigt. Existiert zusätzlich eine normale zusammengefügte Datei, hat diese immer Vorrang.

## Stabile Videokarten 1.4.15

- Beim YouTube-Import übernimmt Lunar Dauer und Originaltitel direkt aus der Playlist-Metadatenabfrage, die ohnehin schon vor dem Download stattfindet. Die Videokarten zeigen ihre Dauer deshalb sofort, ohne dass jedes Video einmal geöffnet werden muss.
- Der sichtbare Kursname nutzt den Playlist-Titel statt des technischen Ordnernamens mit Kanal-Anhang. Dadurch stehen im Video-Fenster ein sauberer Video-Titel und der klare Playlist-Name.
- Während der Wiedergabe werden nur die wirklich beweglichen Fortschrittswerte aktualisiert. Die Kopfzeile des Video-Fensters und die gesehenen Bereiche werden nicht mehr bei jedem Tick vollständig neu aufgebaut.

## Automatische Maximallautstärke 1.4.16

- Jedes Video wird beim Abspielen unsichtbar auf maximale Lautheit angehoben.
- Ein schneller Limiter fängt Spitzen knapp unter dem digitalen Maximum ab und verhindert Übersteuerung.
- Es wird kein Equalizer verwendet: Das Verhältnis von Höhen und Tiefen bleibt unverändert.
- Die Funktion besitzt bewusst keinen zusätzlichen sichtbaren Schalter oder Regler.

## Player-Tastatursteuerung 2.3.1

- Solange das Video-Fenster offen ist, schaltet die Leertaste immer zwischen Wiedergabe und Pause um.
- Die Pfeiltasten links und rechts springen fünf Sekunden zurück oder vor, ohne die App zu verschieben oder zu scrollen.
- Die Pfeiltasten oben und unten ändern die Lautstärke in Fünf-Prozent-Schritten. Die gewählte Lautstärke bleibt beim Pausieren und beim nächsten Video erhalten.
- Eine kurze Einblendung im Video bestätigt Wiedergabe, Pause, Sprung und Lautstärke.
- Die App verwendet eine integrierte Titelleiste; der zusätzliche native Rahmen entfällt, die Windows-Schaltflächen bleiben erhalten.

## Eigener Lunar-Player 2.3.2

- Die fehleranfälligen nativen Browser-Bedienelemente wurden vollständig ersetzt.
- Der minimalistische Lunar-Player besitzt Play/Pause, eine frei steuerbare Zeitleiste, Zeitangabe, Lautstärke, Bild-in-Bild und Vollbild.
- Pausierte Videos zeigen einen eigenen Play-Knopf ohne den weißen Fokusrahmen des bisherigen Players.
- Ein Klick auf das Video startet oder pausiert; ein Doppelklick schaltet Vollbild um.
- Die Tastatursteuerung aus 2.3.1 bleibt unverändert aktiv.

## Vollständige Zeitanzeige 2.3.3

- Die Player-Zeit zeigt Minuten und Sekunden vollständig an, zum Beispiel `5:06 / 27:56`.
- Bei Videos ab einer Stunde wird automatisch `Stunden:Minuten:Sekunden` verwendet.

## Ruhiger Pausenzustand 2.3.4

- Beim Pausieren oder Fortsetzen erscheint keine zusätzliche Textmeldung mehr.
- Im pausierten Video ist ausschließlich der große Play-Button zu sehen.

## Windows-Taskleistensteuerung 2.3.5

- Beim Bewegen des Mauszeigers über das Lunar-Symbol in der Windows-Taskleiste erscheinen drei Player-Tasten.
- Das Video lässt sich dort fünf Sekunden zurückspulen, pausieren oder fortsetzen und fünf Sekunden vorspulen.
- Die mittlere Taste zeigt automatisch Play oder Pause passend zum aktuellen Zustand.

## Sichtbare Taskleistensymbole 2.3.6

- Die Taskleistensteuerung verwendet echte transparente PNG-Symbole statt SVG-Bildern, die Windows teilweise unsichtbar dargestellt hat.

## Eigene Fensterleiste 2.3.7

- Lunar besitzt oben eine separate, durchgehend greifbare Fensterleiste mit den nativen Windows-Tasten zum Minimieren, Maximieren und Schließen.
- Die vier Lunar-Funktionstasten stehen wieder getrennt darunter an ihrer normalen rechten Position.

## Dauerhaft sichtbare Fensterleiste 2.3.8

- Die Fensterleiste bleibt beim Scrollen fest am oberen Rand stehen.
- Der Seiteninhalt beginnt unterhalb der Leiste und wird von ihr nicht verdeckt.
