from __future__ import annotations

import json
import shutil
import subprocess
import uuid
from fractions import Fraction
from pathlib import Path

from config import (
    BGM_FADE_OUT_SEC,
    ENCODE_CRF,
    ENCODE_PRESET,
    EXPORT_DIR,
    FADE_DURATION_SEC,
    THUMB_DIR,
    THUMB_HEIGHT,
    THUMB_WIDTH,
)
from paths import ffmpeg_concat_file_line
from services.ffmpeg_bin import ffmpeg_bin, ffprobe_bin


def run_ffmpeg(args: list[str], timeout: int = 600) -> None:
    cmd = [ffmpeg_bin(), "-y", "-hide_banner", "-loglevel", "error", *args]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "ffmpeg failed")


def run_ffmpeg_with_progress(
    args: list[str],
    total_seconds: float,
    progress_callback,
    timeout: int = 3600,
) -> None:
    cmd = [
        ffmpeg_bin(), "-y", "-hide_banner", "-loglevel", "error",
        "-nostats", "-progress", "pipe:1",
        *args,
    ]
    proc = subprocess.Popen(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
    )

    import threading

    last_progress = 0.0
    stderr_lines: list[str] = []

    def _read_stdout():
        nonlocal last_progress
        assert proc.stdout is not None
        for line in iter(proc.stdout.readline, ""):
            if line.startswith("out_time_us="):
                try:
                    us = int(line.strip().split("=")[1])
                    if total_seconds > 0:
                        p = min(us / 1_000_000.0 / total_seconds, 0.99)
                        if p - last_progress > 0.01:
                            last_progress = p
                            progress_callback(p)
                except (ValueError, ZeroDivisionError):
                    pass

    def _read_stderr():
        assert proc.stderr is not None
        stderr_lines.append(proc.stderr.read())

    t_out = threading.Thread(target=_read_stdout, daemon=True)
    t_err = threading.Thread(target=_read_stderr, daemon=True)
    t_out.start()
    t_err.start()
    proc.wait(timeout=timeout)
    t_out.join(timeout=5)
    t_err.join(timeout=5)

    if proc.returncode != 0:
        raise RuntimeError("".join(stderr_lines).strip() or "ffmpeg failed")


# ---------------------------------------------------------------------------
# probe helpers
# ---------------------------------------------------------------------------

def probe_video(path: Path) -> dict:
    cmd = [
        ffprobe_bin(), "-v", "quiet", "-print_format", "json",
        "-show_format", "-show_streams", str(path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "ffprobe failed")
    return json.loads(result.stdout)


def _video_stream(probe: dict) -> dict | None:
    for stream in probe.get("streams", []):
        if stream.get("codec_type") == "video":
            return stream
    return None


def parse_duration_ms(probe: dict) -> int:
    duration = float(probe.get("format", {}).get("duration", 0))
    return int(duration * 1000)


def parse_video_size(probe: dict) -> tuple[int, int]:
    stream = _video_stream(probe)
    if not stream:
        return 0, 0
    return int(stream.get("width", 0)), int(stream.get("height", 0))


def _parse_fps(value: str | None, fallback: float = 30.0) -> float:
    if not value:
        return fallback
    try:
        if "/" in value:
            return float(Fraction(value))
        return float(value)
    except (ValueError, ZeroDivisionError):
        return fallback


def probe_fps(path: Path) -> float:
    stream = _video_stream(probe_video(path))
    if not stream:
        return 30.0
    fps = _parse_fps(stream.get("avg_frame_rate"))
    if fps < 1:
        fps = _parse_fps(stream.get("r_frame_rate"))
    return max(fps, 1.0)


def _clip_duration_sec(path: Path) -> float:
    return parse_duration_ms(probe_video(path)) / 1000.0


def _clip_frame_count(path: Path) -> int:
    cmd = [
        ffprobe_bin(), "-v", "error", "-select_streams", "v:0",
        "-count_frames", "-show_entries", "stream=nb_read_frames",
        "-of", "csv=p=0", str(path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode == 0 and result.stdout.strip().isdigit():
        return int(result.stdout.strip())
    return max(int(_clip_duration_sec(path) * probe_fps(path)), 1)


def _stream_start_time(path: Path) -> float:
    cmd = [
        ffprobe_bin(), "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=start_time", "-of", "csv=p=0", str(path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    if result.returncode != 0 or not result.stdout.strip():
        return 0.0
    return float(result.stdout.strip())


def _video_signature(path: Path) -> tuple | None:
    stream = _video_stream(probe_video(path))
    if not stream:
        return None
    fps = probe_fps(path)
    return (
        stream.get("codec_name"),
        int(stream.get("width", 0)),
        int(stream.get("height", 0)),
        stream.get("pix_fmt"),
        round(fps, 3),
    )


def _clips_compatible(clip_paths: list[Path]) -> bool:
    if len(clip_paths) < 2:
        return True
    sigs = [_video_signature(p) for p in clip_paths]
    if any(s is None for s in sigs):
        return False
    return len(set(sigs)) == 1


def _encode_args() -> list[str]:
    return [
        "-c:v", "libx264",
        "-preset", ENCODE_PRESET,
        "-crf", str(ENCODE_CRF),
        "-movflags", "+faststart",
        "-c:a", "copy",
    ]


def _encode_filtered_args() -> list[str]:
    """Video + filtered audio (concat / mix filters require AAC re-encode)."""
    return [
        "-c:v", "libx264",
        "-preset", ENCODE_PRESET,
        "-crf", str(ENCODE_CRF),
        "-movflags", "+faststart",
        "-c:a", "aac",
        "-b:a", "192k",
    ]


def _encode_video_only_args() -> list[str]:
    return [
        "-c:v", "libx264",
        "-preset", ENCODE_PRESET,
        "-crf", str(ENCODE_CRF),
        "-movflags", "+faststart",
    ]


def _audio_normalize_filter(input_label: str, output_label: str) -> str:
    return (
        f"[{input_label}]aformat=sample_fmts=fltp:sample_rates=48000:"
        f"channel_layouts=stereo,asetpts=PTS-STARTPTS[{output_label}]"
    )


def _silence_filter(duration_sec: float, output_label: str) -> str:
    dur = max(duration_sec, 0.01)
    return (
        f"anullsrc=channel_layout=stereo:sample_rate=48000,"
        f"atrim=0:{dur:.6f},asetpts=PTS-STARTPTS[{output_label}]"
    )


def _prep_clip_audio_filter(input_index: int, clip: Path, output_label: str) -> str:
    dur = _clip_duration_sec(clip)
    if _has_audio_stream(clip):
        return _audio_normalize_filter(f"{input_index}:a", output_label)
    return _silence_filter(dur, output_label)


def _copy_args() -> list[str]:
    return ["-map", "0", "-c", "copy", "-movflags", "+faststart"]


def _av_durations_match(path: Path, tolerance: float = 0.05) -> bool:
    if not _has_audio_stream(path):
        return True
    video_dur = _video_stream_duration_sec(path)
    audio_dur = _audio_stream_duration_sec(path)
    if video_dur <= 0 or audio_dur <= 0:
        return True
    return abs(video_dur - audio_dur) < tolerance


def _fix_output_timestamps(path: Path) -> None:
    """Remux or re-encode only when timestamps or A/V length are actually broken."""
    start = _stream_start_time(path)
    if start < 0.05 and _av_durations_match(path):
        return

    if not _av_durations_match(path):
        _align_av_in_place(path)
        if _stream_start_time(path) < 0.05 and _av_durations_match(path):
            return

    start = _stream_start_time(path)
    if start < 0.05:
        return

    tmp = path.with_name(f"{path.stem}_tsfix{path.suffix}")
    try:
        run_ffmpeg([
            "-i", str(path),
            "-map", "0",
            "-c", "copy",
            "-fflags", "+genpts",
            "-movflags", "+faststart",
            str(tmp),
        ])
        if _stream_start_time(tmp) < 0.001:
            tmp.replace(path)
            return
    except RuntimeError:
        pass
    finally:
        if tmp.exists() and tmp != path:
            tmp.unlink(missing_ok=True)

    tmp = path.with_name(f"{path.stem}_reenc{path.suffix}")
    try:
        run_ffmpeg([
            "-i", str(path),
            "-map", "0",
            "-vf", "setpts=PTS-STARTPTS,format=yuv420p",
            *_encode_args(),
            str(tmp),
        ])
        tmp.replace(path)
    finally:
        if tmp.exists():
            tmp.unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# thumbnails (still images only — not part of video output quality)
# ---------------------------------------------------------------------------

def _thumb_scale_filter() -> str:
    w, h = THUMB_WIDTH, THUMB_HEIGHT
    return (
        f"scale={w}:{h}:force_original_aspect_ratio=increase,"
        f"crop={w}:{h}"
    )


def make_thumbnail(input_path: Path, output_path: Path, at_ms: int = 0) -> None:
    ss = max(at_ms / 1000.0, 0)
    run_ffmpeg([
        "-ss", str(ss), "-i", str(input_path),
        "-frames:v", "1",
        "-vf", _thumb_scale_filter(),
        str(output_path),
    ])


def make_asset_thumbnail(input_path: Path, output_path: Path, at_ms: int = 0) -> None:
    make_thumbnail(input_path, output_path, at_ms)


def asset_thumb_path(asset_id: int) -> Path:
    return THUMB_DIR / f"asset_{asset_id}.jpg"


# ---------------------------------------------------------------------------
# clip extraction — stream copy first, high-quality encode only as fallback
# ---------------------------------------------------------------------------

def _has_audio_stream(path: Path) -> bool:
    for stream in probe_video(path).get("streams", []):
        if stream.get("codec_type") == "audio":
            return True
    return False


def _has_video_stream(path: Path) -> bool:
    return _video_stream(probe_video(path)) is not None


def extract_shot_clip(input_path: Path, output_path: Path, start_ms: int, end_ms: int) -> None:
    start_s = start_ms / 1000.0
    end_s = end_ms / 1000.0
    source_has_audio = _has_audio_stream(input_path)

    if output_path.exists():
        output_path.unlink()

    def clip_is_valid(path: Path) -> bool:
        if not _has_video_stream(path):
            return False
        if source_has_audio and not _has_audio_stream(path):
            return False
        expected = max(end_s - start_s, 0.01)
        video_dur = _video_stream_duration_sec(path)
        container_dur = _clip_duration_sec(path)
        if container_dur < expected * 0.85:
            return False
        if video_dur > 0 and video_dur < expected * 0.85:
            return False
        return True

    try:
        run_ffmpeg([
            "-i", str(input_path),
            "-ss", str(start_s), "-to", str(end_s),
            "-map", "0:v:0", "-map", "0:a?",
            "-c", "copy",
            "-movflags", "+faststart",
            str(output_path),
        ])
        if clip_is_valid(output_path):
            _fix_output_timestamps(output_path)
            if clip_is_valid(output_path):
                return
    except RuntimeError:
        pass
    if output_path.exists():
        output_path.unlink()

    map_args = ["-map", "0:v:0"]
    encode_args = _encode_video_only_args()
    if source_has_audio:
        map_args.extend(["-map", "0:a?"])
        encode_args = _encode_filtered_args()

    run_ffmpeg([
        "-i", str(input_path),
        "-ss", str(start_s), "-to", str(end_s),
        *map_args,
        "-vf", "setpts=PTS-STARTPTS,format=yuv420p",
        *encode_args,
        str(output_path),
    ])


# ---------------------------------------------------------------------------
# concatenation
# ---------------------------------------------------------------------------

TARGET_FPS = 30.0
PREVIEW_ENCODE_PRESET = "veryfast"
PREVIEW_ENCODE_CRF = 22


def _video_encode_args(*, fast: bool = False) -> list[str]:
    if fast:
        return [
            "-c:v", "libx264",
            "-preset", PREVIEW_ENCODE_PRESET,
            "-crf", str(PREVIEW_ENCODE_CRF),
            "-movflags", "+faststart",
        ]
    return _encode_video_only_args()


def _filtered_encode_args(*, fast: bool = False) -> list[str]:
    if fast:
        return [
            "-c:v", "libx264",
            "-preset", PREVIEW_ENCODE_PRESET,
            "-crf", str(PREVIEW_ENCODE_CRF),
            "-movflags", "+faststart",
            "-c:a", "aac",
            "-b:a", "192k",
        ]
    return _encode_filtered_args()


def _video_stream_duration_sec(path: Path) -> float:
    stream = _video_stream(probe_video(path))
    if not stream:
        return 0.0
    raw = stream.get("duration")
    if raw in (None, "N/A"):
        return 0.0
    try:
        return max(float(raw), 0.0)
    except (TypeError, ValueError):
        return 0.0


def _standardize_clip(input_path: Path, output_path: Path, *, fast: bool = False) -> None:
    """Transcode via -vf; pad truncated video streams so A/V match container length."""
    if output_path.exists():
        output_path.unlink()

    expected = _clip_duration_sec(input_path)
    video_dur = _video_stream_duration_sec(input_path)
    pad_sec = 0.0
    if video_dur > 0 and expected > 0 and video_dur < expected * 0.9:
        pad_sec = max(expected - video_dur, 0.0)

    vf_parts = ["settb=AVTB", "setpts=PTS-STARTPTS", "format=yuv420p"]
    if pad_sec > 0.05:
        vf_parts.append(f"tpad=stop_mode=clone:stop_duration={pad_sec:.6f}")
    vf_parts.append(f"fps={TARGET_FPS}")

    has_audio = _has_audio_stream(input_path)
    args = [
        "-i", str(input_path),
        "-vf", ",".join(vf_parts),
        "-map", "0:v:0",
        *_video_encode_args(fast=fast),
    ]
    if has_audio:
        args.extend(["-map", "0:a?", "-c:a", "aac", "-b:a", "192k"])
    else:
        args.append("-an")
    args.append(str(output_path))
    run_ffmpeg(args)


def _audio_stream_duration_sec(path: Path) -> float:
    for stream in probe_video(path).get("streams", []):
        if stream.get("codec_type") != "audio":
            continue
        raw = stream.get("duration")
        if raw in (None, "N/A"):
            continue
        try:
            return max(float(raw), 0.0)
        except (TypeError, ValueError):
            continue
    return 0.0


def _align_av_in_place(path: Path, *, fast: bool = False) -> None:
    """Pad audio or trim to video so later concat demuxer keeps full length."""
    if not _has_audio_stream(path):
        return
    video_dur = _video_stream_duration_sec(path)
    audio_dur = _audio_stream_duration_sec(path)
    if video_dur <= 0 or audio_dur <= 0 or abs(video_dur - audio_dur) < 0.04:
        return

    tmp = path.with_name(f"{path.stem}_av{path.suffix}")
    encode = _filtered_encode_args(fast=fast)
    try:
        if audio_dur < video_dur:
            pad = video_dur - audio_dur
            run_ffmpeg([
                "-i", str(path),
                "-filter_complex", f"[0:a]apad=pad_dur={pad:.6f}[aout]",
                "-map", "0:v:0", "-map", "[aout]",
                *encode,
                str(tmp),
            ])
        else:
            run_ffmpeg([
                "-i", str(path),
                "-map", "0:v:0", "-map", "0:a?",
                "-shortest",
                *encode,
                str(tmp),
            ])
        tmp.replace(path)
    finally:
        if tmp.exists() and tmp != path:
            tmp.unlink()


def _format_filter(input_label: str, output_label: str) -> str:
    return (
        f"[{input_label}]settb=AVTB,setpts=PTS-STARTPTS,"
        f"format=yuv420p[{output_label}]"
    )


def _concat_demuxer_copy(clip_paths: list[Path], output_path: Path) -> None:
    list_path = output_path.with_suffix(".concat.txt")
    try:
        lines = "\n".join(ffmpeg_concat_file_line(p) for p in clip_paths)
        list_path.write_text(lines, encoding="utf-8")
        run_ffmpeg([
            "-f", "concat", "-safe", "0", "-i", str(list_path),
            *_copy_args(),
            str(output_path),
        ], timeout=1800)
    finally:
        list_path.unlink(missing_ok=True)


def _merge_cut(left: Path, right: Path, output: Path, *, fast: bool = False) -> None:
    if _clips_compatible([left, right]):
        _concat_demuxer_copy([left, right], output)
        _align_av_in_place(output, fast=fast)
        return

    work = output.parent / f"_cut_{uuid.uuid4().hex[:8]}"
    work.mkdir(parents=True, exist_ok=True)
    try:
        left_n = work / "left.mp4"
        right_n = work / "right.mp4"
        _standardize_clip(left, left_n, fast=fast)
        _standardize_clip(right, right_n, fast=fast)
        if _clips_compatible([left_n, right_n]):
            _concat_demuxer_copy([left_n, right_n], output)
            _align_av_in_place(output, fast=fast)
            return

        left_has_a = _has_audio_stream(left_n)
        right_has_a = _has_audio_stream(right_n)
        parts = [
            _format_filter("0:v", "v0"),
            _format_filter("1:v", "v1"),
            "[v0][v1]concat=n=2:v=1:a=0,format=yuv420p[vout]",
        ]
        map_args: list[str] = ["-map", "[vout]"]
        if left_has_a or right_has_a:
            parts.append(_prep_clip_audio_filter(0, left_n, "a0"))
            parts.append(_prep_clip_audio_filter(1, right_n, "a1"))
            parts.append("[a0][a1]concat=n=2:v=0:a=1[aout]")
            map_args.extend(["-map", "[aout]"])
            encode_args = _filtered_encode_args(fast=fast)
        else:
            encode_args = _video_encode_args(fast=fast)

        run_ffmpeg([
            "-i", str(left_n), "-i", str(right_n),
            "-filter_complex", ";".join(parts),
            *map_args,
            *encode_args,
            str(output),
        ])
        _align_av_in_place(output, fast=fast)
    finally:
        shutil.rmtree(work, ignore_errors=True)


def _merge_fade(
    left: Path,
    right: Path,
    output: Path,
    fade_duration: float = FADE_DURATION_SEC,
    *,
    fast: bool = False,
) -> None:
    work = output.parent / f"_fade_{uuid.uuid4().hex[:8]}"
    work.mkdir(parents=True, exist_ok=True)
    try:
        left_n = work / "left.mp4"
        right_n = work / "right.mp4"
        _standardize_clip(left, left_n, fast=fast)
        _standardize_clip(right, right_n, fast=fast)
        offset = max(_clip_duration_sec(left_n) - fade_duration, 0)
        left_has_a = _has_audio_stream(left_n)
        right_has_a = _has_audio_stream(right_n)

        parts = [
            _format_filter("0:v", "v0"),
            _format_filter("1:v", "v1"),
            (
                f"[v0][v1]xfade=transition=fade:duration={fade_duration}"
                f":offset={offset:.6f},format=yuv420p[vout]"
            ),
        ]
        map_args: list[str] = ["-map", "[vout]"]

        if left_has_a and right_has_a:
            parts.append(_audio_normalize_filter("0:a", "la"))
            parts.append(_audio_normalize_filter("1:a", "ra"))
            parts.append(
                f"[la][ra]acrossfade=d={fade_duration:.6f}:c1=tri:c2=tri[aout]"
            )
            map_args.extend(["-map", "[aout]"])
            encode_args = _filtered_encode_args(fast=fast)
        elif left_has_a or right_has_a:
            out_dur = max(
                _clip_duration_sec(left_n) + _clip_duration_sec(right_n) - fade_duration,
                0.01,
            )
            parts.append(_prep_clip_audio_filter(0, left_n, "a0"))
            parts.append(_prep_clip_audio_filter(1, right_n, "a1"))
            parts.append("[a0][a1]concat=n=2:v=0:a=1[aout]")
            parts.append(f"[aout]atrim=0:{out_dur:.6f},asetpts=PTS-STARTPTS[aout2]")
            map_args.extend(["-map", "[aout2]"])
            encode_args = _filtered_encode_args(fast=fast)
        else:
            encode_args = _video_encode_args(fast=fast)

        run_ffmpeg([
            "-i", str(left_n), "-i", str(right_n),
            "-filter_complex", ";".join(parts),
            *map_args,
            *encode_args,
            str(output),
        ])
        _align_av_in_place(output, fast=fast)
    finally:
        shutil.rmtree(work, ignore_errors=True)


def _concat_all_cuts(clip_paths: list[Path], output_path: Path, *, fast: bool = False) -> None:
    if _clips_compatible(clip_paths):
        _concat_demuxer_copy(clip_paths, output_path)
        _align_av_in_place(output_path, fast=fast)
        return

    work = output_path.parent / f"_cuts_{uuid.uuid4().hex[:8]}"
    work.mkdir(parents=True, exist_ok=True)
    try:
        normed: list[Path] = []
        for i, clip in enumerate(clip_paths):
            out = work / f"clip_{i}.mp4"
            _standardize_clip(clip, out, fast=fast)
            normed.append(out)
        if _clips_compatible(normed):
            _concat_demuxer_copy(normed, output_path)
            _align_av_in_place(output_path, fast=fast)
            return

        n = len(normed)
        input_args: list[str] = []
        for p in normed:
            input_args.extend(["-i", str(p)])

        parts = [_format_filter(f"{i}:v", f"v{i}") for i in range(n)]
        labels = "".join(f"[v{i}]" for i in range(n))
        parts.append(f"{labels}concat=n={n}:v=1:a=0,format=yuv420p[vout]")

        any_audio = any(_has_audio_stream(p) for p in normed)
        map_args: list[str] = ["-map", "[vout]"]
        if any_audio:
            for i, p in enumerate(normed):
                parts.append(_prep_clip_audio_filter(i, p, f"a{i}"))
            a_labels = "".join(f"[a{i}]" for i in range(n))
            parts.append(f"{a_labels}concat=n={n}:v=0:a=1[aout]")
            map_args.extend(["-map", "[aout]"])
            encode_args = _filtered_encode_args(fast=fast)
        else:
            encode_args = _video_encode_args(fast=fast)

        run_ffmpeg([
            *input_args, "-filter_complex", ";".join(parts),
            *map_args,
            *encode_args,
            str(output_path),
        ], timeout=1800)
        _align_av_in_place(output_path, fast=fast)
    finally:
        shutil.rmtree(work, ignore_errors=True)


def _concat_iterative(
    clip_paths: list[Path],
    transitions: list[str],
    output_path: Path,
    fade_duration: float = FADE_DURATION_SEC,
    progress_callback=None,
    *,
    fast: bool = False,
) -> None:
    temp_dir = output_path.parent / f"_tmp_{uuid.uuid4().hex[:8]}"
    temp_dir.mkdir(parents=True, exist_ok=True)
    current = clip_paths[0]
    steps = len(clip_paths) - 1

    try:
        for i, next_clip in enumerate(clip_paths[1:], start=1):
            is_last = i == steps
            merged = output_path if is_last else temp_dir / f"merge_{i}.mp4"
            transition = transitions[i - 1] if i - 1 < len(transitions) else "cut"
            if transition == "fade":
                _merge_fade(current, next_clip, merged, fade_duration, fast=fast)
            else:
                _merge_cut(current, next_clip, merged, fast=fast)
            current = merged
            if progress_callback:
                progress_callback(i / steps)
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def concat_shots(
    clip_paths: list[Path],
    transitions: list[str],
    output_path: Path,
    fade_duration: float = FADE_DURATION_SEC,
    progress_callback=None,
    *,
    fast: bool = False,
) -> None:
    if not clip_paths:
        raise ValueError("no clips to concat")

    if len(clip_paths) == 1:
        run_ffmpeg(["-i", str(clip_paths[0]), *_copy_args(), str(output_path)])
        _fix_output_timestamps(output_path)
        return

    has_fade = any(t == "fade" for t in transitions)

    if not has_fade:
        _concat_all_cuts(clip_paths, output_path, fast=fast)
        if progress_callback:
            progress_callback(1.0)
    else:
        _concat_iterative(
            clip_paths,
            transitions,
            output_path,
            fade_duration,
            progress_callback,
            fast=fast,
        )

    _fix_output_timestamps(output_path)


def apply_export_audio(
    input_path: Path,
    output_path: Path,
    *,
    include_shot_audio: bool,
    shot_audio_volume: float = 1.0,
    bgm_path: Path | None,
    bgm_volume: float = 0.35,
    fade_out_sec: float | None = None,
) -> None:
    """Mix or strip audio on the concatenated export. BGM fades out at video end."""
    duration = _clip_duration_sec(input_path)
    if duration <= 0:
        raise RuntimeError("invalid video duration")

    use_bgm = bgm_path is not None and bgm_path.is_file()
    use_orig = include_shot_audio and _has_audio_stream(input_path)
    orig_vol = max(0.0, min(float(shot_audio_volume), 2.0))

    if output_path.exists() and output_path != input_path:
        output_path.unlink()

    if not use_bgm and use_orig:
        if input_path.resolve() == output_path.resolve():
            return
        if abs(orig_vol - 1.0) < 0.001:
            run_ffmpeg(["-i", str(input_path), *_copy_args(), str(output_path)])
        else:
            run_ffmpeg([
                "-i", str(input_path),
                "-filter:a", f"volume={orig_vol}",
                "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                "-movflags", "+faststart",
                str(output_path),
            ])
        return

    if not use_bgm and not use_orig:
        run_ffmpeg([
            "-i", str(input_path),
            "-map", "0:v", "-an",
            "-c:v", "copy", "-movflags", "+faststart",
            str(output_path),
        ])
        return

    fade = fade_out_sec if fade_out_sec is not None else min(BGM_FADE_OUT_SEC, duration / 2)
    fade = max(min(fade, duration), 0.1)
    fade_start = max(duration - fade, 0.0)
    vol = max(0.0, min(float(bgm_volume), 2.0))
    dur = f"{duration:.6f}"
    fade_start_s = f"{fade_start:.6f}"
    fade_d = f"{fade:.6f}"

    if use_bgm and not use_orig:
        bgm_filter = (
            f"[1:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,"
            f"atrim=0:{dur},asetpts=PTS-STARTPTS,volume={vol},"
            f"afade=t=out:st={fade_start_s}:d={fade_d}[aout]"
        )
        run_ffmpeg([
            "-i", str(input_path),
            "-stream_loop", "-1", "-i", str(bgm_path),
            "-filter_complex", bgm_filter,
            "-map", "0:v", "-map", "[aout]",
            "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
            "-movflags", "+faststart", "-shortest",
            str(output_path),
        ], timeout=1800)
        return

    if use_bgm and use_orig:
        mix_filter = (
            f"[0:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,"
            f"volume={orig_vol}[va];"
            f"[1:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,"
            f"atrim=0:{dur},asetpts=PTS-STARTPTS,volume={vol},"
            f"afade=t=out:st={fade_start_s}:d={fade_d}[ba];"
            f"[va][ba]amix=inputs=2:duration=first:dropout_transition=0[aout]"
        )
        run_ffmpeg([
            "-i", str(input_path),
            "-stream_loop", "-1", "-i", str(bgm_path),
            "-filter_complex", mix_filter,
            "-map", "0:v", "-map", "[aout]",
            "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
            "-movflags", "+faststart", "-shortest",
            str(output_path),
        ], timeout=1800)
        return

    if use_orig:
        run_ffmpeg(["-i", str(input_path), *_copy_args(), str(output_path)])


def new_export_path(name: str) -> Path:
    safe = uuid.uuid4().hex[:8]
    slug = "".join(c if c.isalnum() or c in "_-" else "_" for c in name)[:32]
    return EXPORT_DIR / f"{safe}_{slug}.mp4"
