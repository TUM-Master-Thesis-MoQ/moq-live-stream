#!/bin/bash

# Check if the filename is passed as a parameter
if [ $# -lt 1 ]; then
    echo "Usage: $0 <fileName>"
    exit 1
fi

# Assign the first argument to fileName
fileName="$1"

# Define the keywords of strings
keywords=("Sent packet" "Received packet" "Lost packet" "Dropped packet" "Updated metrics" "DropRate" "Realtime bandwidth" "Method 1" "Method 2" "Method 3")

# Create a directory with the file name (excluding the extension)
dirName="${fileName%%.log}"
mkdir -p "$dirName"

echo "Splitting logs into directory: $dirName"

# Loop through the file line by line
while IFS= read -r line; do
    # Check each prefix in the keywords
    for index in "${!keywords[@]}"; do
        prefix=${keywords[$index]}
        if [[ $line == $prefix* ]]; then
            # Create or append to the log file in the directory using the index as a prefix
            echo "$line" >> "$dirName/$index-$prefix.log"
        fi
    done
done < "$fileName"

echo ""
echo "Extracting $base_dir/4-Updated metrics.log into CSV..."
./rtt_cwnd.sh "$dirName"

echo ""
echo "Extracting $base_dir/5-DropRate.log into CSV..."
./dropRate_retransmissionRate.sh "$dirName"

echo ""
echo "Extracting $base_dir/6-Realtime bandwidth.log into CSV..."
./realtime_bandwidth.sh "$dirName"

echo ""
echo "Extracting $base_dir/8-Method 2.log into CSV..."
./rtt_ema_m2.sh "$dirName"