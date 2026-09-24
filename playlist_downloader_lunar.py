from pathlib import Path
import json
import os
import re
import subprocess
import sys
import time

try:
    # Electron reads this pipe as UTF-8. Explicitly setting it prevents broken
    # umlauts in Windows progress and error messages.
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except AttributeError:
    pass

yt_dlp = None
sanitize_filename = None


def load_youtube_engine():
    """Load yt-dlp only for a new download, not for local media repair."""
    global yt_dlp, sanitize_filename
    if yt_dlp is not None and sanitize_filename is not None:
        return
    standalone_engine = os.environ.get("LUNAR_YTDLP_PATH", "").strip()
    if standalone_engine and Path(standalone_engine).is_file():
        sys.path.insert(0, standalone_engine)
    try:
        import yt_dlp as loaded_ytdlp
        from yt_dlp.utils import sanitize_filename as loaded_sanitize_filename
    except Exception as exc:
        raise RuntimeError(f"Die YouTube-Engine konnte nicht geladen werden: {exc}") from exc
    yt_dlp = loaded_ytdlp
    sanitize_filename = loaded_sanitize_filename


VIDEO_EXTENSIONS = {".mp4", ".mkv", ".mov", ".webm", ".m4v", ".avi", ".wmv"}
AUDIO_EXTENSIONS = {".m4a", ".aac", ".mp3", ".ogg", ".opus", ".webm"}
PARTIAL_EXTENSIONS = {".part", ".ytdl"}
SPLIT_STREAM_PATTERN = re.compile(r"^(?P<base>.+)\.f(?P<format_id>\d+)(?:-\d+)?$", re.IGNORECASE)
PLAYLIST_INDEX_PATTERN = re.compile(r"^\s*(?P<index>\d{1,5})\s*(?:[-–—_.])\s*", re.IGNORECASE)
QUALITY_PROFILES = {
    "compact": {"height": 720, "label": "platzsparend (max. 720p)"},
    "balanced": {"height": 1080, "label": "ausgewogen (max. 1080p)"},
    "high": {"height": 1440, "label": "hoch (max. 1440p)"},
    "audiobook": {"height": None, "label": "Hörbuch (Audio + Thumbnail)"},
}

THUMBNAIL_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".avif"}


class LunarLogger:
    """Collect yt-dlp's useful messages without flooding Lunar's UI."""

    def __init__(self):
        self.warnings = []
        self.errors = []

    def debug(self, message):
        return None

    def info(self, message):
        return None

    def warning(self, message):
        text = str(message or "").strip()
        if text:
            self.warnings.append(text)

    def error(self, message):
        text = str(message or "").strip()
        if text:
            self.errors.append(text)

    def detail(self):
        items = self.errors[-4:] or self.warnings[-3:]
        return " | ".join(items)


def emit_progress(message, percent=None, phase="download", **extra):
    payload = {"message": str(message), "phase": phase}
    if percent is not None:
        payload["percent"] = max(0, min(100, round(float(percent), 1)))
    payload.update({key: value for key, value in extra.items() if value not in (None, "")})
    print("LUNAR_PROGRESS=" + json.dumps(payload, ensure_ascii=False), flush=True)


def best_thumbnail_url(info, entries):
    candidates = [info]
    candidates.extend(entry for entry in entries or [] if isinstance(entry, dict))
    for item in candidates:
        direct = str(item.get("thumbnail") or "").strip()
        if direct:
            return direct
        thumbnails = item.get("thumbnails") or []
        for thumbnail in reversed(thumbnails):
            if isinstance(thumbnail, dict) and str(thumbnail.get("url") or "").strip():
                return str(thumbnail["url"]).strip()
    return ""


def compact_detail(value, limit=460):
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    text = re.sub(r"^(ERROR:\s*)+", "", text, flags=re.IGNORECASE)
    if len(text) > limit:
        return "…" + text[-limit:]
    return text


def friendly_error(detail, fallback=None):
    raw = compact_detail(detail)
    lower = raw.lower()

    if any(token in lower for token in (
        "sign in to confirm", "confirm you’re not a bot", "confirm you're not a bot",
        "use --cookies", "cookies from browser", "login required"
    )):
        return "YouTube verlangt eine Anmeldung oder Bot-Prüfung. Melde dich in Firefox bei YouTube an und starte den Import erneut."
    if "private video" in lower or "private playlist" in lower:
        return "Die Playlist bzw. ihre Videos sind privat. Öffne sie mit dem berechtigten Konto in Firefox und starte den Import erneut."
    if any(token in lower for token in ("members-only", "members only", "paid members")):
        return "Die Playlist enthält Mitglieder-Inhalte. Lunar kann sie nur mit gültigen Cookies eines berechtigten YouTube-Kontos laden."
    if any(token in lower for token in ("video unavailable", "video is unavailable", "this video is unavailable", "deleted video")):
        return "Die Playlist enthält keine erreichbaren Videos mehr. Private, gelöschte oder regional gesperrte Videos werden übersprungen."
    if any(token in lower for token in ("http error 403", "forbidden", "access denied")):
        return "YouTube hat den Abruf blockiert. Aktualisiere yt-dlp, prüfe den YouTube-Login in Firefox und versuche es erneut."
    if any(token in lower for token in ("unable to download api page", "too many requests", "rate limit", "http error 429")):
        return "YouTube begrenzt den Abruf gerade. Warte kurz und versuche es mit deinem angemeldeten Firefox-Profil erneut."
    if any(token in lower for token in ("not available in your country", "geo restricted", "geographic restriction")):
        return "Die Videos sind an deinem Standort nicht verfügbar."
    if any(token in lower for token in ("unsupported url", "not a valid url", "playlist does not exist")):
        return "Der Link ist keine erreichbare YouTube-Playlist. Öffne die Playlist in YouTube und kopiere den vollständigen Link erneut."
    if any(token in lower for token in ("no video formats", "requested format is not available")):
        return "Für dieses Video konnte kein kompatibler Stream gefunden werden. Versuche es erneut oder wähle die platzsparende Qualität."
    if any(token in lower for token in ("timed out", "connection reset", "network is unreachable", "temporary failure", "name or service not known")):
        return "Die Verbindung zu YouTube ist abgebrochen. Prüfe die Internetverbindung und starte den Import erneut."
    if any(token in lower for token in ("js runtime", "n challenge", "signature", "yt-dlp-ejs")):
        return "YouTube verlangt eine JavaScript-Prüfung. Aktualisiere yt-dlp, installiere Deno 2.3+ und starte Lunar danach neu."
    if raw:
        return raw
    return fallback or "Kein abspielbares Video wurde gespeichert. Die Playlist kann privat, leer, gesperrt oder durch eine YouTube-Anmeldeprüfung geschützt sein."


def truncate_component(value, limit=100):
    value = str(value or "").strip()
    return value if len(value) <= limit else value[:limit].rstrip(" .")


def safe_course_name(title, channel):
    raw = f"{title} - {channel}".strip(" -")
    cleaned = sanitize_filename(raw, restricted=False).strip(" .")
    cleaned = truncate_component(cleaned, 100)
    if cleaned.upper() in {"CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "LPT1", "LPT2", "LPT3"}:
        cleaned = f"{cleaned} Kurs"
    return cleaned or "YouTube-Playlist"


def clean_display_title(value, fallback="YouTube-Playlist"):
    cleaned = re.sub(r"\s+", " ", str(value or "")).strip()
    return truncate_component(cleaned, 120) or fallback


def metadata_duration(value):
    try:
        duration = float(value)
    except (TypeError, ValueError):
        return 0
    return round(duration, 3) if duration > 0 else 0


def write_playlist_metadata(course_folder, playlist_title, channel, entries):
    """Keep the playlist response that is already in memory for Lunar's cards."""
    videos = []
    for fallback_index, entry in enumerate(entries or [], start=1):
        if not isinstance(entry, dict):
            continue
        try:
            playlist_index = int(entry.get("playlist_index") or entry.get("playlist_autonumber") or fallback_index)
        except (TypeError, ValueError):
            playlist_index = fallback_index
        title = clean_display_title(entry.get("title") or entry.get("fulltitle") or "", fallback="")
        duration = metadata_duration(entry.get("duration"))
        if playlist_index <= 0 or not title:
            continue
        videos.append({
            "playlistIndex": playlist_index,
            "title": title,
            "duration": duration,
            "videoId": str(entry.get("id") or ""),
        })

    payload = {
        "version": 1,
        "playlist": {
            "title": clean_display_title(playlist_title),
            "channel": clean_display_title(channel, fallback=""),
        },
        "videos": videos,
    }
    target = course_folder / ".lunar-playlist-metadata.json"
    temporary = target.with_name(target.name + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temporary, target)


def existing_video_files(course_folder):
    if not course_folder.exists():
        return []
    result = []
    for item in course_folder.rglob("*"):
        try:
            if (
                item.is_file()
                and not item.name.startswith(".")
                and item.suffix.lower() in VIDEO_EXTENSIONS
                and item.stat().st_size >= 1024
            ):
                result.append(item)
        except OSError:
            continue
    return sorted(result)


def existing_media_files(course_folder):
    if not course_folder.exists():
        return []
    result = []
    supported_extensions = VIDEO_EXTENSIONS | AUDIO_EXTENSIONS
    for item in course_folder.rglob("*"):
        try:
            if (
                item.is_file()
                and not item.name.startswith(".")
                and item.suffix.lower() in supported_extensions
                and item.stat().st_size >= 1024
            ):
                result.append(item)
        except OSError:
            continue
    return sorted(result)


def playlist_index_for_file(media_file, playlist_count=0):
    match = PLAYLIST_INDEX_PATTERN.match(media_file.name)
    if match:
        try:
            return int(match.group("index"))
        except (TypeError, ValueError):
            return 0
    return 1 if playlist_count == 1 and media_file.name.upper().startswith("NA - ") else 0


def playlist_media_state(course_folder, ffmpeg_location, playlist_count=0):
    """Return verified A/V files and indices containing only one stream."""
    complete = {}
    incomplete = set()
    if not ffmpeg_location:
        return complete, incomplete
    for media_file in existing_media_files(course_folder):
        index = playlist_index_for_file(media_file, playlist_count)
        if index <= 0:
            continue
        has_video, has_audio = stream_types(ffmpeg_location, media_file)
        if has_video and has_audio:
            complete[index] = media_file
            incomplete.discard(index)
        elif (has_video or has_audio) and index not in complete:
            incomplete.add(index)
    return complete, incomplete


def complete_playlist_media(course_folder, ffmpeg_location, playlist_count=0):
    """Return verified A/V files keyed by their playlist index."""
    complete, _ = playlist_media_state(course_folder, ffmpeg_location, playlist_count)
    return complete


def release_incomplete_archive_entries(course_archive, entries, complete_indices):
    """Unmark only incomplete playlist items so yt-dlp can retry just those."""
    if not course_archive.exists():
        return 0
    incomplete_ids = set()
    for fallback_index, entry in enumerate(entries or [], start=1):
        if not isinstance(entry, dict):
            continue
        try:
            index = int(entry.get("playlist_index") or entry.get("playlist_autonumber") or fallback_index)
        except (TypeError, ValueError):
            index = fallback_index
        video_id = str(entry.get("id") or "").strip()
        if video_id and index not in complete_indices:
            incomplete_ids.add(video_id)
    if not incomplete_ids:
        return 0
    try:
        lines = course_archive.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return 0
    kept = []
    removed = 0
    for line in lines:
        parts = line.strip().split()
        archived_id = parts[-1] if parts else ""
        if archived_id in incomplete_ids:
            removed += 1
        else:
            kept.append(line)
    if removed:
        temporary = course_archive.with_name(course_archive.name + ".tmp")
        temporary.write_text(("\n".join(kept) + ("\n" if kept else "")), encoding="utf-8")
        os.replace(temporary, course_archive)
    return removed


def playlist_entry_indices(entries):
    """Return real playlist positions; YouTube positions may contain gaps."""
    ordered = []
    seen = set()
    for fallback_index, entry in enumerate(entries or [], start=1):
        if not isinstance(entry, dict):
            continue
        try:
            index = int(entry.get("playlist_index") or entry.get("playlist_autonumber") or fallback_index)
        except (TypeError, ValueError):
            index = fallback_index
        if index > 0 and index not in seen:
            ordered.append(index)
            seen.add(index)
    return ordered


def combine_repair_reports(*reports):
    combined = {"repaired": 0, "cleaned": 0, "remaining": 0, "errors": []}
    for report in reports:
        if not isinstance(report, dict):
            continue
        combined["repaired"] += int(report.get("repaired") or 0)
        combined["cleaned"] += int(report.get("cleaned") or 0)
        combined["remaining"] = int(report.get("remaining") or 0)
        combined["errors"].extend(report.get("errors") or [])
    return combined


def stream_types(ffmpeg_location, media_file):
    """Return whether one downloaded stream contains video and/or audio."""
    try:
        probe = subprocess.run(
            [str(ffmpeg_location), "-hide_banner", "-i", str(media_file)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
            errors="replace",
            timeout=45,
            check=False,
        )
        detail = probe.stderr or ""
    except (OSError, subprocess.TimeoutExpired):
        return False, False
    return bool(re.search(r"\bVideo:\s", detail)), bool(re.search(r"\bAudio:\s", detail))


def is_ready_file(media_file):
    try:
        return media_file.is_file() and media_file.stat().st_size >= 1024
    except OSError:
        return False


def repair_split_media_streams(course_folder, ffmpeg_location):
    """Merge yt-dlp's leftover .f137/.f251 stream pairs into one playable MP4.

    A clean yt-dlp run already removes these source streams. This repair covers
    interrupted/failed post-processing and old Lunar imports without deleting
    a source file unless the resulting MP4 has both picture and sound.
    """
    report = {"repaired": 0, "cleaned": 0, "remaining": 0, "errors": []}
    if not ffmpeg_location or not course_folder.exists():
        return report

    groups = {}
    supported_extensions = VIDEO_EXTENSIONS | AUDIO_EXTENSIONS
    for item in course_folder.rglob("*"):
        try:
            if not item.is_file() or item.suffix.lower() not in supported_extensions:
                continue
            match = SPLIT_STREAM_PATTERN.match(item.stem)
            if not match:
                continue
            key = (item.parent, match.group("base"))
            groups.setdefault(key, []).append(item)
        except OSError:
            continue

    for (parent, base_name), fragments in groups.items():
        fragments = sorted(set(fragments), key=lambda item: item.name.lower())
        output = parent / f"{base_name}.mp4"
        sources = [item for item in fragments if is_ready_file(item)]
        if is_ready_file(output):
            sources.insert(0, output)

        typed_sources = []
        for item in sources:
            has_video, has_audio = stream_types(ffmpeg_location, item)
            typed_sources.append((item, has_video, has_audio))

        complete_source = next((item for item, has_video, has_audio in typed_sources if has_video and has_audio), None)
        if complete_source:
            try:
                if complete_source != output:
                    os.replace(complete_source, output)
                for fragment in fragments:
                    if fragment != output and fragment.exists():
                        fragment.unlink()
                        report["cleaned"] += 1
                report["repaired"] += 1
            except OSError as exc:
                report["errors"].append(f"{base_name}: {compact_detail(exc, 180)}")
            continue

        video_source = next((item for item, has_video, _ in typed_sources if has_video), None)
        audio_source = next((item for item, _, has_audio in typed_sources if has_audio and item != video_source), None)
        if not video_source or not audio_source:
            report["remaining"] += len(fragments)
            continue

        temporary = output.with_name(f".{output.stem}.lunar-merge-{os.getpid()}.tmp.mp4")
        try:
            merge = subprocess.run(
                [
                    str(ffmpeg_location), "-y", "-loglevel", "error",
                    "-i", str(video_source), "-i", str(audio_source),
                    "-map", "0:v:0", "-map", "1:a:0",
                    "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
                    "-movflags", "+faststart", str(temporary),
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                text=True,
                errors="replace",
                timeout=900,
                check=False,
            )
            merged_video, merged_audio = stream_types(ffmpeg_location, temporary)
            if merge.returncode != 0 or not is_ready_file(temporary) or not (merged_video and merged_audio):
                detail = compact_detail(merge.stderr, 180) or "ffmpeg konnte Bild und Ton nicht zusammenführen"
                report["errors"].append(f"{base_name}: {detail}")
                report["remaining"] += len(fragments)
                continue
            os.replace(temporary, output)
            for fragment in fragments:
                if fragment.exists():
                    fragment.unlink()
                    report["cleaned"] += 1
            report["repaired"] += 1
        except (OSError, subprocess.TimeoutExpired) as exc:
            report["errors"].append(f"{base_name}: {compact_detail(exc, 180)}")
            report["remaining"] += len(fragments)
        finally:
            try:
                if temporary.exists():
                    temporary.unlink()
            except OSError:
                pass
    # Interrupted older repairs can leave a hidden, very large merge file.
    # Remove it only when the corresponding final MP4 has already been verified.
    for temporary in course_folder.rglob(".*.lunar-merge-*.tmp.mp4"):
        try:
            marker = temporary.name.find(".lunar-merge-")
            if marker <= 1:
                continue
            output = temporary.with_name(temporary.name[1:marker] + ".mp4")
            if not is_ready_file(output):
                continue
            has_video, has_audio = stream_types(ffmpeg_location, output)
            if has_video and has_audio:
                temporary.unlink()
                report["cleaned"] += 1
        except OSError:
            continue
    return report


def remove_stale_partial_files(course_folder, max_age_days=14):
    cutoff = time.time() - max_age_days * 24 * 60 * 60
    removed = 0
    for item in course_folder.rglob("*"):
        try:
            if item.is_file() and item.suffix.lower() in PARTIAL_EXTENSIONS and item.stat().st_mtime < cutoff:
                item.unlink()
                removed += 1
        except OSError:
            continue
    return removed


def runtime_options(runtime_name):
    runtime_name = str(runtime_name or "").strip().lower()
    if runtime_name == "deno":
        return {
            "js_runtimes": {"deno": {}},
            # Equivalent to --remote-components ejs:github. The CLI shorthand
            # --remote-components ejs resolves to the same official provider.
            "remote_components": ["ejs:github"],
        }
    return {}


def firefox_cookie_options():
    """Equivalent to yt-dlp's --cookies-from-browser firefox."""
    return {"cookiesfrombrowser": ("firefox", None, None, None)}


def youtube_connection_options():
    """Use one proven connection policy for metadata and every video request."""
    return {
        # Equivalent to yt-dlp's --force-ipv4. It avoids unreliable IPv6 routes
        # without changing the user's network configuration.
        "source_address": "0.0.0.0",
        "extractor_args": {
            "youtube": {
                "player_client": ["default", "-ios"],
            },
        },
        # Prefer direct HTTPS media URLs, which are more dependable for local
        # Windows downloads than alternative protocols.
        "format_sort": ["proto:https"],
    }


def format_for(quality, ffmpeg_available):
    if quality == "audiobook":
        return "worstaudio"
    profile = QUALITY_PROFILES.get(quality, QUALITY_PROFILES["balanced"])
    maximum_height = profile["height"]
    if ffmpeg_available:
        return (
            f"bestvideo*[height<={maximum_height}][vcodec!=none]+bestaudio[acodec!=none]"
            f"/best[height<={maximum_height}][vcodec!=none][acodec!=none]"
        )
    return f"best[height<={maximum_height}][acodec!=none][vcodec!=none]/best[height<={maximum_height}]"


def create_audiobook_videos(course_folder, ffmpeg_location, progress_callback=None):
    """Turn each downloaded audio track and its thumbnail into a normal MP4.

    Audio is stream-copied. Only the static image is encoded at one frame per
    second so the result remains small and plays like an ordinary Lunar video.
    """
    if not ffmpeg_location:
        raise RuntimeError("Für Hörbücher wird ffmpeg benötigt. Lunar konnte ffmpeg nicht bereitstellen.")

    converted = 0
    errors = []
    candidates = []
    for item in course_folder.iterdir():
        if not item.is_file() or item.suffix.lower() not in AUDIO_EXTENSIONS:
            continue
        has_video, has_audio = stream_types(ffmpeg_location, item)
        if has_audio and not has_video:
            candidates.append(item)

    total = len(candidates)
    for position, audio_file in enumerate(candidates, 1):
        if progress_callback:
            progress_callback(position, total, audio_file.stem, "start")
        thumbnails = [
            item for item in course_folder.iterdir()
            if item.is_file()
            and item.stem == audio_file.stem
            and item.suffix.lower() in THUMBNAIL_EXTENSIONS
        ]
        if not thumbnails:
            errors.append(f"Kein Thumbnail für {audio_file.name} gefunden")
            if progress_callback:
                progress_callback(position, total, audio_file.stem, "error")
            continue

        output_file = audio_file.with_suffix(".mp4")
        temporary = audio_file.with_name(audio_file.stem + ".lunar-audiobook.mp4")
        command = [
            str(ffmpeg_location), "-y", "-loglevel", "error",
            "-loop", "1", "-framerate", "1", "-i", str(thumbnails[0]),
            "-i", str(audio_file),
            "-map", "0:v:0", "-map", "1:a:0",
            "-vf", "scale='min(1280,iw)':-2:force_original_aspect_ratio=decrease,"
                   "pad=ceil(iw/2)*2:ceil(ih/2)*2",
            "-c:v", "libx264", "-preset", "ultrafast", "-tune", "stillimage",
            "-r", "1", "-pix_fmt", "yuv420p",
            "-c:a", "copy", "-shortest", "-movflags", "+faststart",
            str(temporary),
        ]
        result = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace")
        if result.returncode != 0 or not temporary.exists():
            errors.append(f"{audio_file.name}: {compact_detail(result.stderr, 180)}")
            temporary.unlink(missing_ok=True)
            if progress_callback:
                progress_callback(position, total, audio_file.stem, "error")
            continue

        temporary.replace(output_file)
        audio_file.unlink(missing_ok=True)
        for thumbnail in thumbnails:
            thumbnail.unlink(missing_ok=True)
        converted += 1
        if progress_callback:
            progress_callback(position, total, audio_file.stem, "done")

    return {"converted": converted, "errors": errors}


def parse_arguments():
    if len(sys.argv) < 6:
        raise RuntimeError("Interner Lunar-Downloader wurde ohne die nötigen Argumente gestartet.")

    url = sys.argv[1].strip()
    courses_dir = Path(sys.argv[2]).expanduser()

    # Lunar 1.4.1 passed a global download archive in slot 3. Keep old launches
    # compatible, but never use that global archive: it incorrectly skips a
    # video when it belongs to a different playlist/course.
    possible_legacy_archive = Path(sys.argv[3]).expanduser()
    if possible_legacy_archive.name == "youtube-download-archive.txt":
        lunar_root = Path(sys.argv[4]).expanduser()
        downloads_root = Path(sys.argv[5]).expanduser()
        js_runtime = sys.argv[6].strip().lower() if len(sys.argv) >= 7 else ""
        ffmpeg_location = "ffmpeg" if len(sys.argv) >= 8 and sys.argv[7].strip() == "1" else ""
        quality = "balanced"
    else:
        lunar_root = possible_legacy_archive
        downloads_root = Path(sys.argv[4]).expanduser()
        js_runtime = sys.argv[5].strip().lower() if len(sys.argv) >= 6 else ""
        ffmpeg_location = sys.argv[6].strip() if len(sys.argv) >= 7 else ""
        if ffmpeg_location == "0":
            ffmpeg_location = ""
        quality = sys.argv[7].strip().lower() if len(sys.argv) >= 8 else "balanced"

    target_folder = Path(sys.argv[8]).expanduser() if len(sys.argv) >= 9 and sys.argv[8].strip() else None
    return url, courses_dir, lunar_root, downloads_root, js_runtime, ffmpeg_location, quality, target_folder


def main():
    if len(sys.argv) >= 4 and sys.argv[1] == "--repair":
        course_folder = Path(sys.argv[2]).expanduser()
        ffmpeg_location = sys.argv[3].strip()
        report = repair_split_media_streams(course_folder, ffmpeg_location)
        print("LUNAR_REPAIR=" + json.dumps(report, ensure_ascii=False), flush=True)
        return

    load_youtube_engine()
    url, courses_dir, lunar_root, downloads_root, js_runtime, ffmpeg_location, quality, target_folder = parse_arguments()
    append_to_course = target_folder is not None
    ffmpeg_available = bool(ffmpeg_location)
    if not url:
        raise RuntimeError("Der YouTube-Playlist-Link fehlt.")

    courses_dir.mkdir(parents=True, exist_ok=True)
    lunar_root.mkdir(parents=True, exist_ok=True)
    emit_progress("Video wird gelesen …" if append_to_course else "Playlist wird gelesen …", 0, "metadata")

    cache_dir = lunar_root / "yt-dlp-cache"
    metadata_logger = LunarLogger()
    metadata_options = {
        "quiet": True,
        "no_warnings": False,
        "ignoreerrors": True,
        "skip_download": True,
        "extract_flat": False if append_to_course else "in_playlist",
        "noplaylist": append_to_course,
        "playlistreverse": False,
        "socket_timeout": 30,
        "retries": 5,
        "cachedir": str(cache_dir),
        "logger": metadata_logger,
        **firefox_cookie_options(),
        **runtime_options(js_runtime),
        **youtube_connection_options(),
    }
    try:
        with yt_dlp.YoutubeDL(metadata_options) as ydl:
            info = ydl.extract_info(url, download=False)
    except Exception as exc:
        raise RuntimeError(friendly_error(metadata_logger.detail() or str(exc), "Die YouTube-Playlist konnte nicht gelesen werden.")) from exc

    if not isinstance(info, dict):
        raise RuntimeError(friendly_error(metadata_logger.detail(), "Die YouTube-Playlist konnte nicht gelesen werden."))

    playlist_title = str(info.get("title") or info.get("playlist_title") or "YouTube-Playlist")
    channel = str(
        info.get("channel")
        or info.get("uploader")
        or info.get("playlist_channel")
        or info.get("playlist_uploader")
        or "Unbekannter Kanal"
    )
    course_display_name = clean_display_title(playlist_title)
    if quality == "audiobook":
        course_display_name = f"{course_display_name} · Hörbücher"
    course_name = safe_course_name(course_display_name, channel)
    course_folder = target_folder if append_to_course else courses_dir / course_name
    course_folder.mkdir(parents=True, exist_ok=True)
    course_archive = course_folder / ".lunar-download-archive.txt"

    raw_entries = [info] if append_to_course else list(info.get("entries") or [])
    queue_thumbnail_url = best_thumbnail_url(info, raw_entries)
    emit_progress(
        (f"Video erkannt · {course_display_name}" if append_to_course else f"Playlist erkannt · {course_display_name}"),
        0,
        "metadata",
        playlistTitle=course_display_name,
        thumbnailUrl=queue_thumbnail_url,
    )
    if not append_to_course:
        write_playlist_metadata(course_folder, course_display_name, channel, raw_entries)
    total = 0 if append_to_course else len(raw_entries)
    expected_indices = playlist_entry_indices(raw_entries)
    preflight_repair = repair_split_media_streams(course_folder, ffmpeg_location) if ffmpeg_available and quality != "audiobook" else {"repaired": 0, "cleaned": 0, "remaining": 0, "errors": []}
    if ffmpeg_available:
        complete_before, incomplete_before = playlist_media_state(course_folder, ffmpeg_location, total)
    else:
        complete_before, incomplete_before = {}, set()
    released_before = release_incomplete_archive_entries(course_archive, raw_entries, set(complete_before))
    media_label = "Hörbücher" if quality == "audiobook" else "Videos"
    if preflight_repair["repaired"]:
        emit_progress(f"{preflight_repair['repaired']} vorhandene Video(s) lokal repariert …", 1, "repair")
    if incomplete_before:
        emit_progress(f"{len(incomplete_before)} Video(s) ohne Bild oder Ton werden zuerst nachgeladen …", 1, "repair-download")
    elif released_before:
        emit_progress(f"{released_before} fehlende Video(s) werden gezielt nachgeladen …", 1, "missing-download")
    else:
        emit_progress(f"{total or 'Playlist'} {media_label} werden geprüft …", 1, "download")

    stage = {"indices": [], "label": "Download", "phase": "download", "start": 2.0, "end": 95.0}

    def progress_hook(data):
        status = data.get("status")
        info_dict = data.get("info_dict") or {}
        try:
            index = int(info_dict.get("playlist_index") or info_dict.get("playlist_autonumber") or 0)
        except (TypeError, ValueError):
            index = 0
        title = str(info_dict.get("title") or "Video")
        indices = stage["indices"]
        try:
            position = indices.index(index) + 1
        except ValueError:
            position = max(1, index)
        count = len(indices) or total or 1
        if status == "downloading":
            downloaded = float(data.get("downloaded_bytes") or 0)
            size = float(data.get("total_bytes") or data.get("total_bytes_estimate") or 0)
            within = (downloaded / size) if size > 0 else 0
            overall = stage["start"] + (((position - 1) + within) / count * (stage["end"] - stage["start"]))
            emit_progress(f"{stage['label']} {position}/{count} · {title}", overall, stage["phase"])
        elif status == "finished":
            overall = stage["start"] + (position / count * (stage["end"] - stage["start"]))
            emit_progress(f"{stage['label']} {position}/{count} fertig · {title}", overall, stage["phase"])

    existing_indices = [playlist_index_for_file(item, 0) for item in existing_video_files(course_folder)]
    next_course_index = max([index for index in existing_indices if index > 0] or [0]) + 1
    file_template = f"{next_course_index:03d} - %(title).120B.%(ext)s" if append_to_course else "%(playlist_index)03d - %(title).120B.%(ext)s"
    download_logger = LunarLogger()
    options = {
        "outtmpl": str(course_folder / file_template),
        "noplaylist": append_to_course,
        "playlistreverse": False,
        "ignoreerrors": True,
        "continuedl": True,
        "writethumbnail": True,
        "windowsfilenames": True,
        "trim_file_name": 145,
        "nopart": False,
        "overwrites": False,
        "download_archive": str(course_archive),
        "progress_hooks": [progress_hook],
        "retries": 8,
        "fragment_retries": 8,
        "file_access_retries": 3,
        "concurrent_fragment_downloads": 10 if quality == "audiobook" else 3,
        "socket_timeout": 30,
        "cachedir": str(cache_dir),
        "format": format_for(quality, ffmpeg_available),
        "logger": download_logger,
        **firefox_cookie_options(),
        **runtime_options(js_runtime),
        **youtube_connection_options(),
    }
    if ffmpeg_available:
        options["merge_output_format"] = "mp4"
        options["ffmpeg_location"] = ffmpeg_location
    else:
        emit_progress("ffmpeg nicht gefunden · kompatibler Einzelstream wird verwendet …", 1, "download")
    emit_progress("Firefox-Login und Deno/EJS werden verwendet …", 1, "download")

    def download_stage(indices, label, phase, start, end, overwrite=False):
        ordered = [int(index) for index in indices if int(index) > 0]
        if not ordered:
            return 0
        stage.update({"indices": ordered, "label": label, "phase": phase, "start": float(start), "end": float(end)})
        stage_options = dict(options)
        if not append_to_course:
            stage_options["playlist_items"] = ",".join(str(index) for index in ordered)
        stage_options["overwrites"] = bool(overwrite)
        try:
            with yt_dlp.YoutubeDL(stage_options) as ydl:
                return ydl.download([url]) or 0
        except Exception as exc:
            raise RuntimeError(friendly_error(download_logger.detail() or str(exc), "YouTube-Download fehlgeschlagen.")) from exc

    code = 0
    staged_repair = {"repaired": 0, "cleaned": 0, "remaining": 0, "errors": []}
    incomplete_indices = []
    missing_indices = []
    if quality != "audiobook" and ffmpeg_available and total:
        expected_set = set(expected_indices)
        incomplete_indices = sorted(index for index in incomplete_before if index in expected_set)
        if incomplete_indices:
            emit_progress(f"Phase 1/2 · {len(incomplete_indices)} Video(s) ohne Bild oder Ton …", 2, "repair-download")
            code = max(code, download_stage(incomplete_indices, "Bild/Ton", "repair-download", 2, 47, overwrite=True))
            emit_progress("Phase 1/2 · Bild und Ton werden geprüft …", 47, "merge")
            staged_repair = repair_split_media_streams(course_folder, ffmpeg_location)

        complete_after_repair, still_incomplete = playlist_media_state(course_folder, ffmpeg_location, total)
        missing_indices = [index for index in expected_indices if index not in complete_after_repair and index not in still_incomplete]
        if missing_indices:
            missing_start = 48 if incomplete_indices else 2
            missing_prefix = "Phase 2/2 · " if incomplete_indices else ""
            emit_progress(f"{missing_prefix}{len(missing_indices)} komplett fehlende Video(s) …", missing_start, "missing-download")
            code = max(code, download_stage(missing_indices, "Fehlend", "missing-download", missing_start, 95, overwrite=False))
        elif incomplete_indices:
            emit_progress("Phase 2/2 · Keine weiteren Playlist-Videos fehlen.", 95, "missing-download")
        else:
            emit_progress("Kurs vollständig · keine Videos müssen nachgeladen werden.", 95, "download")
    else:
        all_indices = expected_indices or [1]
        code = download_stage(all_indices, "Download", "download", 2, 95, overwrite=False)

    audiobook_report = {"converted": 0, "errors": []}
    if quality == "audiobook":
        emit_progress("Audio und Thumbnail werden zu Hörbuch-Videos zusammengefügt …", 96, "download")
        def audiobook_progress(position, count, title, state):
            within = position if state in ("done", "error") else max(0, position - 1)
            percent = 96 + ((within / count) * 2 if count else 2)
            verb = "fertig" if state == "done" else "wird erstellt"
            if state == "error":
                verb = "konnte nicht erstellt werden"
            emit_progress(
                f"Hörbuch {position}/{count or '?'} {verb} · {title}",
                percent,
                "convert",
            )
        audiobook_report = create_audiobook_videos(course_folder, ffmpeg_location, audiobook_progress)
    if ffmpeg_available and quality != "audiobook":
        emit_progress("Download fertig · Bild und Ton werden zusammengeführt und geprüft …", 96, "merge")
    postflight_repair = repair_split_media_streams(course_folder, ffmpeg_location) if ffmpeg_available and quality != "audiobook" else {"repaired": 0, "cleaned": 0, "remaining": 0, "errors": []}
    repair_report = combine_repair_reports(preflight_repair, staged_repair, postflight_repair)
    if repair_report["repaired"]:
        emit_progress(f"{repair_report['repaired']} Video(s) mit Ton zusammengefügt …", 97, "download")

    complete_after = complete_playlist_media(course_folder, ffmpeg_location, total) if ffmpeg_available else {
        playlist_index_for_file(item, total): item for item in existing_video_files(course_folder)
        if playlist_index_for_file(item, total) > 0
    }
    released_after = release_incomplete_archive_entries(course_archive, raw_entries, set(complete_after))
    ready_files = list(complete_after.values())
    ready_count = len(complete_after)
    new_count = len(set(complete_after) - set(complete_before))

    if not ready_files:
        detail = download_logger.detail()
        raise RuntimeError(friendly_error(detail, "Kein abspielbares Video wurde gespeichert. Die Playlist kann privat, leer oder durch eine YouTube-Anmeldeprüfung geschützt sein."))

    remove_stale_partial_files(course_folder)
    skipped = max(0, total - ready_count) if total else 0
    status_bits = (["Video zum Kurs hinzugefügt"] if append_to_course and new_count else [f"{ready_count} Videos bereit"])
    if new_count:
        status_bits.append(f"{new_count} neu geladen")
    if skipped:
        status_bits.append(f"{skipped} fehlen oder sind unvollständig – Kurs aktualisieren erneut versuchen")
    elif repair_report["errors"]:
        status_bits.append(f"{len(repair_report['errors'])} Zusammenführungsfehler")
    if code not in (None, 0) and not skipped:
        status_bits.append("einzelne YouTube-Hinweise ignoriert")
    status_message = " · ".join(status_bits)

    emit_progress(status_message, 98, "download")
    emit_progress("Video ist heruntergeladen. Lunar liest den Kurs neu ein …" if append_to_course else "Playlist ist heruntergeladen. Lunar liest den Kurs ein …", 99, "scan")
    print("LUNAR_RESULT=" + json.dumps({
        "course_name": course_folder.name if append_to_course else course_display_name,
        "course_folder": str(course_folder),
        "playlist_title": playlist_title,
        "channel": channel,
        "video_count": ready_count,
        "new_count": new_count,
        "playlist_count": total,
        "skipped_count": skipped,
        "warning_count": max(skipped, len(repair_report["errors"])),
        "cookies_used": True,
        "js_runtime": js_runtime,
        "ffmpeg": ffmpeg_available,
        "stream_repair": repair_report,
        "archive_entries_released": released_before + released_after,
        "incomplete_indices_checked": incomplete_indices,
        "missing_indices_checked": missing_indices,
        "audiobook_conversion": audiobook_report,
        "quality": quality if quality in QUALITY_PROFILES else "balanced",
        "status_message": status_message,
    }, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("LUNAR_ERROR=" + json.dumps({"message": "Download abgebrochen."}, ensure_ascii=False), flush=True)
        raise SystemExit(130)
    except Exception as exc:
        print("LUNAR_ERROR=" + json.dumps({"message": str(exc)}, ensure_ascii=False), flush=True)
        raise SystemExit(1)
