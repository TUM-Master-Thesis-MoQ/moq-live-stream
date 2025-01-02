import sys
import pandas as pd  # type: ignore
import matplotlib.pyplot as plt  # type: ignore
import cairosvg  # type: ignore
import os  # type: ignore


def plot_csv(csv_file, x_label, y_label):
    # Read the CSV file into a DataFrame
    try:
        data = pd.read_csv(csv_file)
    except FileNotFoundError:
        print(f"Error: File not found - {csv_file}")
        sys.exit(1)

    # Check if the DataFrame is empty
    if data.empty:
        print(f"The CSV file is empty: {csv_file}")
        return

    # Check if the provided labels exist in the header
    if x_label not in data.columns or y_label not in data.columns:
        print(
            f"Error: One or both labels '{x_label}', '{y_label}' not found in the CSV headers."
        )
        print(f"Available columns: {', '.join(data.columns)}")
        sys.exit(1)

    # Extract the columns for plotting
    x = data[x_label]
    y = data[y_label]

    # Calculate statistics
    mean_y = y.mean()
    variance_y = y.var()
    ema_y = y.ewm(span=20, adjust=False).mean()  # EMA with a span of 20

    # Configure the graph size
    plt.figure(figsize=(30, 10))  # 30 inches wide, 10 inches tall

    # Plot the data as a dot matrix (no connecting lines)
    plt.scatter(
        x, y, marker="o", color="b", label=y_label
    )  # Marker is a circle, color blue

    # Plot the EMA line
    plt.plot(x, ema_y, color="r", label="EMA")  # EMA line in red

    # Set labels and title
    plt.xlabel(x_label)
    plt.ylabel(y_label)
    # plt.title(f"{y_label}")
    plt.grid()

    # Add annotations for mean and variance
    plt.axhline(
        mean_y, color="g", linestyle="--", label=f"Mean: {mean_y:.2f}"
    )  # Mean line in green
    plt.text(
        x.iloc[-1], mean_y, f"Mean: {mean_y:.2f}", color="g", verticalalignment="bottom"
    )
    plt.text(
        x.iloc[-1],
        mean_y,
        f"Variance: {variance_y:.2f}",
        color="g",
        verticalalignment="top",
    )

    # Add legend
    plt.legend()

    # Adjust layout to remove margins
    plt.subplots_adjust(left=0, right=1, top=1, bottom=0)

    # Save the graph as an SVG file
    svg_file = csv_file.replace(".csv", f"_{y_label}.svg")
    plt.savefig(svg_file, format="svg", bbox_inches="tight", pad_inches=0)
    # print(f"Graph saved as: {svg_file}")

    # Convert the SVG to a PDF
    pdf_file = csv_file.replace(".csv", f"_{y_label}.pdf")
    cairosvg.svg2pdf(url=svg_file, write_to=pdf_file)
    print(f"Graph saved as: {pdf_file}")

    # Remove the SVG file
    os.remove(svg_file)
    # print(f"SVG file removed: {svg_file}")

    plt.close()


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python3 plotter.py <x_label> <y_label> <csv_file>")
        sys.exit(1)

    # The input CSV file to be processed
    x_label = sys.argv[1]
    y_label = sys.argv[2]
    csv_file = sys.argv[3]

    # Call the function to plot the graph
    plot_csv(csv_file, x_label, y_label)
