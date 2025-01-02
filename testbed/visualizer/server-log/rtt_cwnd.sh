#!/bin/bash

# Check if the base directory is passed as a parameter
if [ $# -lt 1 ]; then
    echo "Usage: $0 <base_directory>"
    exit 1
fi

# Assign the first argument to the base directory variable
base_dir="$1"

# Define input and output file names
input_file="$base_dir/4-Updated metrics.log"
output_csv="$base_dir/4-Updated metrics.csv"

# Check if the input file exists
if [ ! -f "$input_file" ]; then
    echo "Input file not found: $input_file"
    exit 1
fi

# Initialize the CSV file with a header
echo "Index,RTT (μs),CWND (B),Bytes In Flight (B)" > "$output_csv"

# Read the input file line by line and extract RTT and CWND values
index=0
while IFS= read -r line; do
    # Extract RTT and CWND values using grep and sed
    rtt=$(echo "$line" | grep -oE "rtt=[0-9]+" | sed 's/rtt=//')
    cwnd=$(echo "$line" | grep -oE "cwnd=[0-9]+" | sed 's/cwnd=//')
    bytesInFlight=$(echo "$line" | grep -oE "bytesInFlight=[0-9]+" | sed 's/bytesInFlight=//')
    
    # If both values are found, append them to the CSV
    if [[ -n $rtt && -n $cwnd ]]; then
        echo "$index,$rtt,$cwnd,$bytesInFlight" >> "$output_csv"
        index=$((index + 1))
    fi
done < "$input_file"

echo "CSV file generated: $output_csv"

python3 ../plotter.py "Index" "RTT (μs)" "$output_csv"
python3 ../plotter.py "Index" "CWND (B)" "$output_csv"
python3 ../plotter.py "Index" "Bytes In Flight (B)" "$output_csv"
