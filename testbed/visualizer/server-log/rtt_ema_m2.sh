#!/bin/bash

# Check if the base directory is passed as a parameter
if [ $# -lt 1 ]; then
    echo "Usage: $0 <base_directory>"
    exit 1
fi

# Assign the first argument to the base directory variable
base_dir="$1"

# Define input and output file names
input_file="$base_dir/8-Method 2.log"
output_csv="$base_dir/8-Method 2.csv"

# Check if the input file exists
if [ ! -f "$input_file" ]; then
    echo "Input file not found: $input_file"
    exit 1
fi

# Initialize the CSV file with a header
echo "Time (s),RTT EMA Variance,CWND EMA Variance" > "$output_csv"

# Read the input file line by line and extract rttEMAVariance and cwndEMAVariance values
index=0
while IFS= read -r line; do
    # Extract time, rttEMAVariance, and cwndEMAVariance values using grep and sed
    time=$(echo "$line" | grep -oE "time: [0-9\.]+" | sed 's/time: //')
    rttEMAVariance=$(echo "$line" | grep -oE "rttEMAVariance: [0-9\.e-]+" | sed 's/rttEMAVariance: //')
    cwndEMAVariance=$(echo "$line" | grep -oE "cwndEMAVariance: [0-9\.e-]+" | sed 's/cwndEMAVariance: //')
    
    # If both values are found, append them to the CSV
    if [[ -n $rttEMAVariance && -n $cwndEMAVariance ]]; then
        echo "$index,$rttEMAVariance,$cwndEMAVariance" >> "$output_csv"
        index=$(echo "$index + $time" | bc)
    fi
done < "$input_file"

echo "CSV file generated: $output_csv"

python3 ../plotter.py "Time (s)" "RTT EMA Variance" "$output_csv"
python3 ../plotter.py "Time (s)" "CWND EMA Variance" "$output_csv"