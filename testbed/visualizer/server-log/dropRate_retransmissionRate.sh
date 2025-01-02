#!/bin/bash

# Check if the base directory is passed as a parameter
if [ $# -lt 1 ]; then
    echo "Usage: $0 <base_directory>"
    exit 1
fi

# Assign the first argument to the base directory variable
base_dir="$1"

# Define input and output file names
input_file="$base_dir/5-DropRate.log"
output_csv="$base_dir/5-DropRate.csv"

# Check if the input file exists
if [ ! -f "$input_file" ]; then
    echo "Input file not found: $input_file"
    exit 1
fi

# Initialize the CSV file with a header
echo "Index,Drop Rate,Retransmission Rate" > "$output_csv"

# Read the input file line by line and extract DropRate and RetransmissionRate values
index=0
while IFS= read -r line; do
    # Extract DropRate and RetransmissionRate values using grep and sed
    drop_rate=$(echo "$line" | grep -oE "DropRate: [^,]+" | sed 's/DropRate: //')
    retrans_rate=$(echo "$line" | grep -oE "RetransmissionRate: [^,]+" | sed 's/RetransmissionRate: //')
    
    # If both values are found, append them to the CSV
    if [[ -n $drop_rate && -n $retrans_rate && $drop_rate != "NaN" && $retrans_rate != "NaN" ]]; then
        echo "$index,$drop_rate,$retrans_rate" >> "$output_csv"
        index=$((index + 1))
    fi
done < "$input_file"

echo "CSV file generated: $output_csv"

python3 ../plotter.py "Index" "Drop Rate" "$output_csv"
python3 ../plotter.py "Index" "Retransmission Rate" "$output_csv"