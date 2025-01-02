#!/bin/bash

# Check if the filename is passed as a parameter
if [ $# -lt 1 ]; then
    echo "Usage: $0 <log_file>"
    exit 1
fi

# Assign the first argument to the log file variable
log_file="$1"

# Get the directory name by removing the file extension from the log file
dir_name="${log_file%%.*}"

# Create a directory with the extracted name
mkdir -p "$dir_name"

# Define the keywords to match
keywords=("chunk: video" "chunk: audio" "Current audio jitter" "Current video jitter" "Current audio bitrate" "Current video bitrate" "Current frame drop rate" "Current frame delay rate" "Delayed rendering" "Pre-drop" "Post-drop" "Video buffer size")

# Loop through the keywords and create corresponding log files
for keyword in "${keywords[@]}"; do
    output_log="$dir_name/$keyword.log"
    # Empty the file if it already exists
    > "$output_log"
done

echo "Splitting audience log file into sub-log files in: $dir_name/..."

# Read the log file line by line
while IFS= read -r line; do
    # Check if the line contains "video" or "audio"
    for keyword in "${keywords[@]}"; do
        if [[ "$line" == *"$keyword"* ]]; then
            # Append the line to the respective keyword log file
            echo "$line" >> "$dir_name/$keyword.log"
        fi
    done
done < "$log_file"

echo ""
echo "Extracting 'chunk type, timestamp and size' from log files into CSV format..."
./chunk.sh "$dir_name"

echo ""
echo "Extracting 'audio & video bitrates' from log files into CSV format..."
./bitrate.sh "$dir_name"

echo ""
echo "Extracting 'jitter values' from log files into CSV format..."
./jitter.sh "$dir_name"

echo ""
echo "Extracting 'frame drop rates' from log files into CSV format..."
./dropRate.sh "$dir_name"

echo ""
echo "Extracting 'delayed rendering values' from log files into CSV format..."
./delayed_rendering.sh "$dir_name"

echo ""
echo "Extracting 'pre-drop values' from log files into CSV format..."
./pre-drop.sh "$dir_name"

echo ""
echo "Extracting 'post-drop values' from log files into CSV format..."
./post-drop.sh "$dir_name"

echo ""
echo "Extracting 'delay rate values' from log files into CSV format..."
./delayRate.sh "$dir_name"

echo ""
echo "Extracting 'video buffer size values' from log files into CSV format..."
./video-buffer-size.sh "$dir_name"