import csv
import argparse
import os

"""
calculate_relative_dates.py

This script calculates relative dates for objects listed in a CSV file. Each object has a timestamp
and an appearance order (denoted by the `#` column). The script computes the time difference
between subsequent appearances of the same object based on the provided timestamps.

### Input:
- The input CSV file should contain the following headers:
  - Timestamp: A unique identifier for each object appearance.
  - #: An integer representing the appearance order of the object.
  - Date: A timestamp indicating when the object appeared.

### Output:
- The script generates a new CSV file with the following additional column:
  - Relative Date: The time difference (in milliseconds) from the previous appearance of the object.

### Usage:
Run the script from the command line, providing the path to the input CSV file as an argument:
```bash
python3 calculate_relative_dates.py input.csv
```
"""


def calculate_relative_dates(input_file, delimiter=","):
    # Read the CSV input file with specified delimiter and handling BOM
    with open(input_file, mode="r", encoding="utf-8-sig") as infile:
        reader = csv.DictReader(infile, delimiter=delimiter)

        # Get the fieldnames to check if 'Timestamp' exists
        headers = reader.fieldnames
        print(
            f"CSV headers: {headers}"
        )  # Print the headers to check if they are correct

        # Ensure headers are stripped of any leading/trailing spaces
        rows = [{k.strip(): v for k, v in row.items()} for row in reader]

    # Prepare the output list of rows with an extra column for relative dates
    output_rows = []

    # Temporary storage to track appearances for each object based on Timestamp
    grouped_objects = {}

    # Group the rows by 'Timestamp'
    for row in rows:
        timestamp = row.get("Timestamp")  # Use get() to handle missing 'Timestamp' key
        appearance_num = int(row["#"])
        date = int(row["Date"])

        if timestamp not in grouped_objects:
            grouped_objects[timestamp] = []

        # Append each appearance to the group of this timestamp
        grouped_objects[timestamp].append((appearance_num, date, row))

    # Now calculate relative dates for each grouped object
    for timestamp, appearances in grouped_objects.items():
        # Sort appearances by the '#' value (0, 1, 2, ...)
        appearances.sort(key=lambda x: x[0])  # Sort by appearance_num

        # Calculate relative dates
        for i in range(len(appearances)):
            appearance_num, current_date, row = appearances[i]
            if i == 0:
                # First appearance, relative date is 0
                relative_date = 0
            else:
                # Calculate the relative date to the previous appearance
                previous_date = appearances[i - 1][1]
                relative_date = current_date - previous_date

            # Add the relative date to the current row and append to output
            output_row = {
                "Timestamp": row["Timestamp"],
                "#": row["#"],
                "Date": row["Date"],
                "Relative Date": relative_date,
            }
            output_rows.append(output_row)

    # Generate the output file name by appending "_relative_date.csv" to the input file name (excluding the extension)
    base_name, _ = os.path.splitext(input_file)
    output_file = f"{base_name}_relative_date.csv"

    # Write the output to a new CSV file
    with open(output_file, mode="w", newline="") as outfile:
        fieldnames = ["Timestamp", "#", "Date", "Relative Date"]
        writer = csv.DictWriter(outfile, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(output_rows)

    print(f"Relative dates have been calculated and saved to {output_file}")


# Main function to handle command-line arguments
if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Calculate relative dates for objects in a CSV file."
    )
    parser.add_argument("input_file", help="Path to the input CSV file")
    parser.add_argument(
        "--delimiter", default=",", help="CSV delimiter (default is ',')"
    )

    args = parser.parse_args()

    # Call the function with the input file and delimiter provided as arguments
    calculate_relative_dates(args.input_file, args.delimiter)
