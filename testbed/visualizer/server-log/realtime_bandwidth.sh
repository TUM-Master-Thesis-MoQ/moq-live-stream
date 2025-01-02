#!/bin/bash

# Check if the base directory is passed as a parameter
if [ $# -lt 1 ]; then
    echo "Usage: $0 <base_directory>"
    exit 1
fi

# Assign the first argument to the base directory variable
base_dir="$1"

# Define input and output file names
input_file="$base_dir/6-Realtime bandwidth.log"
output_csv="$base_dir/6-Realtime bandwidth.csv"

# Check if the input file exists
if [ ! -f "$input_file" ]; then
    echo "Input file not found: $input_file"
    exit 1
fi

# Initialize the CSV file with a header
echo "Time (s),Upload (Bps),Download (Bps)" > "$output_csv"

# Read the input file line by line and extract upload and download values
index=0
while IFS= read -r line; do
    # Extract upload and download values using grep and sed
    upload=$(echo "$line" | grep -oE "upload: [0-9]+" | sed 's/upload: //')
    download=$(echo "$line" | grep -oE "download: [0-9]+" | sed 's/download: //')
    
    # If both values are found, append them to the CSV
    if [[ -n $upload && -n $download ]]; then
        echo "$index,$upload,$download" >> "$output_csv"
        index=$((index + 1))
    fi
done < "$input_file"

echo "CSV file generated: $output_csv"

python3 ../plotter.py "Time (s)" "Upload (Bps)" "$output_csv"
python3 ../plotter.py "Time (s)" "Download (Bps)" "$output_csv"