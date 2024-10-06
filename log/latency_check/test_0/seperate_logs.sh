#!/bin/bash

# Check if input log file is passed as argument
if [ -z "$1" ]; then
    echo "Usage: $0 log_file"
    exit 1
fi

logfile=$1
audio_file="audio_log.txt"
video_file="video_log.txt"

# Clear the output files if they already exist
> "$audio_file"
> "$video_file"

# Read the log file line by line
while IFS= read -r line; do
    # Check if the line contains 🔊 or 🎬 and append to respective file
    if [[ "$line" == *"🔊"* ]]; then
        echo "$line" >> "$audio_file"
    elif [[ "$line" == *"🎬"* ]]; then
        echo "$line" >> "$video_file"
    fi
done < "$logfile"

echo "Audio logs saved to $audio_file"
echo "Video logs saved to $video_file"
