#!/bin/bash

if [ ! -f bbb_sunflower_1080p_30fps_normal.mp4 ]; then
    if [ ! -f bbb_sunflower_1080p_30fps_normal.mp4.zip ]; then
        wget https://download.blender.org/demo/movies/BBB/bbb_sunflower_1080p_30fps_normal.mp4.zip
    fi
    unzip bbb_sunflower_1080p_30fps_normal.mp4.zip
    rm bbb_sunflower_1080p_30fps_normal.mp4.zip
fi

original_bitrate=$(ffprobe -v error -select_streams v:0 -show_entries stream=bit_rate -of default=noprint_wrappers=1:nokey=1 bbb_sunflower_1080p_30fps_normal.mp4)

if [ -z "$original_bitrate" ]; then
    echo "Error: Could not extract original bitrate."
    exit 1
fi

# Convert the bitrate to a format suitable for ffmpeg
# FFmpeg requires bitrate in bits per second (bps)
original_bitrate_bps=$(($original_bitrate / 1000))  # Convert to Kbps

# Re-encode video to VP8, select first audio track, downmix to mono, and re-encode audio to Opus
ffmpeg -i bbb_sunflower_1080p_30fps_normal.mp4 \
    -c:v libvpx -b:v "${original_bitrate_bps}k" \
    -c:a libopus -ac 1 \
    -map 0:v:0 -map 0:a:0 \
    bbb_vp8_opus_mono.webm

echo "Re-encoding completed: VP8 video with Opus audio in a WebM container."