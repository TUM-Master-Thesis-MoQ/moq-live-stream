# Visualizer

Shell + Python script to visualize log files.

## Usage

1. Save server and audience log files into the `server-log` and `audience-log` directories, respectively.

2. Activate and install dependencies in `visualizer` directory:
  
    ```bash
    pipenv shell
    pipenv install
    ```

3. Make all shell scripts executable:

    ```bash
    chmod +x ./server-log/*.sh
    chmod +x ./audience-log/*.sh
    ```

4. From the `visualizer` directory, nav into the `server-log` and `audience-log` directories, and run the following command:

    ```bash
    ./splitter.sh <logfile name>
    ```

  `splitter.sh` extracts lines of log files from a keyword list and saves them into a new file using that keyword. Then the respective extract scripts will extract values from the keyword files and save them into new csv files, where the python script will read from and visualize the data by manually setting the x-axis and y-axis header from the csv file.
