#!/bin/bash

# Check if the base directory is passed as a parameter
if [ $# -lt 1 ]; then
    echo "Usage: $0 <base_directory>"
    exit 1
fi

# Assign the first argument to the base directory variable
base_dir="$1"

keywords=("Pre-drop")

for keyword in "${keywords[@]}"; do
    # Define input and output file names
    input_file="$base_dir/$keyword.log"
    output_csv="$base_dir/$keyword.csv"

    # Initialize the CSV file with a header
    echo "Chunk Index,Timestamp (μs),Byte (B),Time (# of ms since the epoch)" > "$output_csv"

    # Check if the input file exists
    if [ ! -f "$input_file" ]; then
        echo "Input file not found: $input_file"
        exit 1
    fi

    # Read the input file line by line
    index=0
    while IFS= read -r line; do
        # Extract drop rate values using grep and sed
        timestamp=$(echo "$line" | grep -oE "timestamp: [0-9]+" | sed "s/timestamp: //")
        bytes=$(echo "$line" | grep -oE "bytes: [0-9]+" | sed "s/bytes: //")
        time=$(echo "$line" | grep -oE "Date.now\(\): [0-9]+" | sed "s/Date.now(): //")
        
        # If values are found, append them to the CSV
        if [[ -n $timestamp && -n $bytes && -n $time ]]; then
            echo "$index,$timestamp,$bytes,$time" >> "$output_csv"
            index=$((index + 1))
        fi
    done < "$input_file"

    echo "CSV file generated: $output_csv"

    python3 ../plotter.py "Chunk Index" "Timestamp (μs)" "$output_csv"
    python3 ../plotter.py "Chunk Index" "Byte (B)" "$output_csv"
    python3 ../plotter.py "Chunk Index" "Time (# of ms since the epoch)" "$output_csv"
done