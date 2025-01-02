import os
import subprocess
import time


# run iperf3 server within a network namespace
def run_iperf_server_ns(ns, ip, log_file):
    try:
        print(f"running {ns} server: ip={ip}")
        cmd = f"ip netns exec {ns} iperf3 -s -B {ip}"

        os.makedirs(os.path.dirname(log_file), exist_ok=True)

        with open(log_file, "w") as f:
            process = subprocess.Popen(cmd.split(), stdout=f, stderr=subprocess.STDOUT)
        return process
    except Exception as e:
        print(f"Error starting iperf3 server on {ns}: {e}")
        raise


# run iperf3 client within a network namespace
def run_iperf_client_ns(ns, server_ip, bandwidth, protocol, duration, log_file):
    try:
        print(f"{protocol}: {ns} client -> server {server_ip}")
        protocol_flag = "-u" if protocol == "UDP" else ""
        cmd = f"ip netns exec {ns} iperf3 -c {server_ip} -b {bandwidth} {protocol_flag} -t {duration}"

        os.makedirs(os.path.dirname(log_file), exist_ok=True)

        with open(log_file, "w") as f:
            process = subprocess.Popen(cmd.split(), stdout=f, stderr=subprocess.STDOUT)
        return process
    except Exception as e:
        print(f"Error starting iperf3 client on {ns}: {e}")
        raise


# Function to run a single test between namespaces
def run_test_ns(
    server_ns, client_ns, server_ip, bandwidth, duration, server_log, client_log
):
    print(
        f"Testing: {client_ns} -> {server_ns} (bandwidth={bandwidth}, duration={duration}s for each protocol)"
    )

    # Start the iperf server inside the server namespace with server ip
    server_process = run_iperf_server_ns(server_ns, server_ip, server_log)
    time.sleep(0.05)  # Give server time to start

    # Start the iperf client inside the client namespace
    run_iperf_client_ns(
        client_ns, server_ip, bandwidth, "TCP", duration, client_log + "_client_tcp.log"
    ).wait()

    run_iperf_client_ns(
        client_ns, server_ip, bandwidth, "UDP", duration, client_log + "_client_udp.log"
    ).wait()

    # Ensure the server process is terminated
    server_process.terminate()


# Test configuration for namespaces
tests = [
    (
        "ns2",
        "ns1",
        "10.0.2.1",
        "10M",
        30,
        "./log/0_streamer_2_server_10M_server.log",
        "./log/0_streamer_2_server_10M",
    ),
    (
        "ns2",
        "ns1",
        "10.0.2.1",
        "20M",
        30,
        "./log/0_streamer_2_server_20M_server.log",
        "./log/0_streamer_2_server_20M",
    ),
    (
        "ns4",
        "ns2",
        "10.0.4.1",
        "5M",
        30,
        "./log/1_server_2_audience(1)_5M_server.log",
        "./log/1_server_2_audience(1)_5M",
    ),
    (
        "ns4",
        "ns2",
        "10.0.4.1",
        "10M",
        30,
        "./log/1_server_2_audience(1)_10M_server.log",
        "./log/1_server_2_audience(1)_10M",
    ),
    (
        "ns5",
        "ns2",
        "10.0.5.1",
        "10M",
        30,
        "./log/1_server_2_audience(2)_10M_server.log",
        "./log/1_server_2_audience(2)_10M",
    ),
    (
        "ns5",
        "ns2",
        "10.0.5.1",
        "20M",
        30,
        "./log/1_server_2_audience(2)_20M_server.log",
        "./log/1_server_2_audience(2)_20M",
    ),
    (
        "ns6",
        "ns2",
        "10.0.6.1",
        "15M",
        30,
        "./log/1_server_2_audience(3)_15M_server.log",
        "./log/1_server_2_audience(3)_15M",
    ),
    (
        "ns6",
        "ns2",
        "10.0.6.1",
        "30M",
        30,
        "./log/1_server_2_audience(3)_30M_server.log",
        "./log/1_server_2_audience(3)_30M",
    ),
]

# Run all tests
if __name__ == "__main__":
    for i, test in enumerate(tests, start=1):
        print(f"{i}/{len(tests)}")
        run_test_ns(*test)

    print("All tests completed!")
