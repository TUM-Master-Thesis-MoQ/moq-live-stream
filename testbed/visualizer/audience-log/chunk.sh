#!/bin/bash

# Check if the base directory is passed as a parameter
if [ $# -lt 1 ]; then
    echo "Usage: $0 <base_directory>"
    exit 1
fi

# Assign the first argument to the base directory variable
base_dir="$1"

# Define the keywords to match
keywords=("chunk: video" "chunk: audio")

# Process each keyword log file
for keyword in "${keywords[@]}"; do
    input_log="$base_dir/$keyword.log"
    output_csv="$base_dir/$keyword.csv"

    # Initialize the CSV file with a header
    echo "Chunk Index,Chunk Timestamp (μs),Relative Chunk Timestamp (μs),Chunk Type (1=key 0=delta),Chunk Size (B)" > "$output_csv"

    # Check if the log file exists
    if [ ! -f "$input_log" ]; then
        echo "Input file not found: $input_log"
        continue
    fi

    # Initialize previous timestamp
    previous_timestamp=0
    first_chunk=true

    index=0
    # Process the log file
    while IFS= read -r line; do
        # Check if the line contains "Deserializing chunk:"
        if [[ $line == *"Deserializing chunk:"* ]]; then
            # Extract chunk type (key or delta), timestamp, and size
            chunk_subtype=$(echo "$line" | grep -oE "(key|delta)")
            timestamp=$(echo "$line" | grep -oE "timestamp: [0-9]+" | sed 's/timestamp: //')
            size=$(echo "$line" | grep -oE "size: [0-9]+" | sed 's/size: //')

            # Convert key to 1 and delta to 0
            if [[ $chunk_subtype == "key" ]]; then
                type_value=1
            elif [[ $chunk_subtype == "delta" ]]; then
                type_value=0
            fi

            # Calculate relative timestamp
            if $first_chunk; then
                relative_timestamp=0
                first_chunk=false
            else
                relative_timestamp=$((timestamp - previous_timestamp))
            fi

            # Update previous timestamp
            previous_timestamp=$timestamp

            # Append to the CSV
            echo "$index,$timestamp,$relative_timestamp,$type_value,$size" >> "$output_csv"
            index=$((index + 1))
        fi
    done < "$input_log"

    echo "CSV file generated: $output_csv"

    python3 ../plotter.py "Chunk Index" "Relative Chunk Timestamp (μs)" "$output_csv"
    python3 ../plotter.py "Chunk Index" "Chunk Type (1=key 0=delta)" "$output_csv"
    python3 ../plotter.py "Chunk Index" "Chunk Size (B)" "$output_csv"
done
