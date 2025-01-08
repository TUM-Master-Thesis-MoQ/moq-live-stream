import sys
import pandas as pd  # type: ignore
import matplotlib.pyplot as plt  # type: ignore
import cairosvg  # type: ignore
import os  # type: ignore


def plot_csv(
    csv_file, x_label, y_label, plot_type="scatter", show_mean=True, show_ema=True
):
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

    # Plot the data as a dot matrix or a line
    if plot_type == "scatter":
        plt.scatter(
            x, y, marker="o", color="b", label=y_label
        )  # Marker is a circle, color blue
    else:
        plt.plot(x, y, color="b", label=y_label)

    # Plot the EMA line
    if show_ema:
        plt.plot(x, ema_y, color="r", label="EMA")  # EMA line in red

    # Set labels and title
    plt.xlabel(x_label, fontsize=28)
    plt.ylabel(y_label, fontsize=28)
    plt.xticks(fontsize=24)
    plt.yticks(fontsize=24)
    # plt.title(f"{y_label}")
    plt.grid()

    # Add annotations for mean and variance
    if show_mean:
        plt.axhline(
            mean_y, color="g", linestyle="--", label=f"Mean: {mean_y:.2f}"
        )  # Mean line in green
        plt.text(
            x.iloc[-1],
            mean_y,
            f"Mean: {mean_y:.2f}",
            color="g",
            verticalalignment="bottom",
            fontsize=28,
        )
        plt.text(
            x.iloc[-1],
            mean_y,
            f"Variance: {variance_y:.2f}",
            color="g",
            verticalalignment="top",
            fontsize=28,
        )

    # Add legend
    plt.legend(fontsize=28)

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
        print(
            "Usage: python3 plotter.py <x_label> <y_label> <csv_file> [line] [no-mean] [no-ema]\n"
            "Arguments:\n"
            "  <x_label>   : The column name to be used for the x-axis.\n"
            "  <y_label>   : The column name to be used for the y-axis.\n"
            "  <csv_file>  : The path to the CSV file containing the data.\n"
            "Optional arguments:\n"
            "  line        : Plot the main graph using lines instead of scattered dots.\n"
            "  no-mean     : Do not show the mean line and its annotation.\n"
            "  no-ema      : Do not show the EMA line."
        )
        sys.exit(1)

    # The input CSV file to be processed
    x_label = sys.argv[1]
    y_label = sys.argv[2]
    csv_file = sys.argv[3]

    # Optional arguments
    plot_type = "scatter"
    show_mean = True
    show_ema = True

    if "line" in sys.argv:
        plot_type = "line"
    if "no-mean" in sys.argv:
        show_mean = False
    if "no-ema" in sys.argv:
        show_ema = False

    # Call the function to plot the graph
    plot_csv(csv_file, x_label, y_label, plot_type, show_mean, show_ema)
