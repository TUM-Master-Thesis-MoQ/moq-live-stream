#!/bin/bash

# Check if the base directory is passed as a parameter
if [ $# -lt 1 ]; then
    echo "Usage: $0 <base_directory>"
    exit 1
fi

# Assign the first argument to the base directory variable
base_dir="$1"

keywords=("Current audio jitter" "Current video jitter")

for keyword in "${keywords[@]}"; do
    # Define input and output file names
    input_file="$base_dir/$keyword.log"
    output_csv="$base_dir/$keyword.csv"

    # Initialize the CSV file with a header
    echo "Chunk Index,Jitter (ms)" > "$output_csv"

    # Check if the input file exists
    if [ ! -f "$input_file" ]; then
        echo "Input file not found: $input_file"
        exit 1
    fi

    # Read the input file line by line and extract jitter values
    index=0
    while IFS= read -r line; do
        # Extract jitter values using grep and sed
        jitter=$(echo "$line" | grep -oE "jitter: [0-9\.]+" | sed 's/jitter: //')
        
        # If value found, append it to the CSV
        if [[ -n $jitter ]]; then
            echo "$index,$jitter" >> "$output_csv"
            index=$((index + 1))
        fi
    done < "$input_file"

    echo "CSV file generated: $output_csv"

    python3 ../plotter.py "Chunk Index" "Jitter (ms)" "$output_csv"
done