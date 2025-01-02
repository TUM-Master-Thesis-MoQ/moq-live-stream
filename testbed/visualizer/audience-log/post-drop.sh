#!/bin/bash

# Check if the base directory is passed as a parameter
if [ $# -lt 1 ]; then
    echo "Usage: $0 <base_directory>"
    exit 1
fi

# Assign the first argument to the base directory variable
base_dir="$1"

keywords=("Post-drop")

for keyword in "${keywords[@]}"; do
    # Define input and output file names
    input_file="$base_dir/$keyword.log"
    output_csv="$base_dir/$keyword.csv"

    # Initialize the CSV file with a header
    echo "Chunk Index,audioTimestamp,droppedFrameTimestamp,currentTimestampDiff,Relative Timestamp Difference (μs)" > "$output_csv"

    # Check if the input file exists
    if [ ! -f "$input_file" ]; then
        echo "Input file not found: $input_file"
        exit 1
    fi

    # Read the input file line by line
    index=0
    # Read the input file line by line
    index=0
    while IFS= read -r line; do
        # Extract values using grep and sed
        audioTimestamp=$(echo "$line" | grep -oE "audio chunk's timestamp: [0-9]+" | sed "s/audio chunk's timestamp: //")
        droppedFrameTimestamp=$(echo "$line" | grep -oE "dropped frame's timestamp: [0-9]+" | sed "s/dropped frame's timestamp: //")
        currentTimestampDiff=$(echo "$line" | grep -oE "currentTimestampDiff: [0-9]+" | sed "s/currentTimestampDiff: //")
        relativeTimestampDiff=$(echo "$line" | grep -oE "relative diff\(current-base\): [0-9]+" | sed "s/relative diff(current-base): //")
        
        # If values are found, append them to the CSV
        if [[ -n $audioTimestamp && -n $droppedFrameTimestamp && -n $currentTimestampDiff && -n $relativeTimestampDiff ]]; then
            echo "$index,$audioTimestamp,$droppedFrameTimestamp,$currentTimestampDiff,$relativeTimestampDiff" >> "$output_csv"
            index=$((index + 1))
        fi
    done < "$input_file"

    echo "CSV file generated: $output_csv"

    python3 ../plotter.py "Chunk Index" "Relative Timestamp Difference (μs)" "$output_csv"
done