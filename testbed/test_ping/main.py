import os
import subprocess
import time


# Function to ping an IP from a namespace and log the output
def ping_from_namespace(ns, ip, log_file, timeout=10):
    try:
        # Ping command with the specified namespace
        cmd = f"ip netns exec {ns} ping -w {timeout} {ip}"

        # Append the result to the log file
        with open(log_file, "a") as f:
            f.write(f"------------------------------------------------------\n\n")
            process = subprocess.Popen(cmd.split(), stdout=f, stderr=subprocess.STDOUT)
            process.wait()
    except Exception as e:
        print(f"Error pinging {ip} from {ns}: {e}")
        raise


# Function to ping multiple IPs from a namespace
def ping_multiple_ips(ns, ip_list, log_file):
    os.makedirs(os.path.dirname(log_file), exist_ok=True)
    with open(log_file, "w") as f:
        f.write(f"------------ Starting ping tests from {ns} ------------\n")
    for ip in ip_list:
        print(f"Pinging {ip} from {ns}...")
        ping_from_namespace(ns, ip, log_file)
        time.sleep(0.05)  # Small delay between each ping (optional)


# Test configuration for namespaces and IP addresses
tests = [
    {
        "namespace": "ns1",
        "ip_list": ["10.0.2.1", "10.0.1.254", "10.0.2.254"],
        "log_file": "./log/ping_ns1.log",
    },
    {
        "namespace": "ns2",
        "ip_list": [
            "10.0.1.1",
            "10.0.4.1",
            "10.0.5.1",
            "10.0.6.1",
            "10.0.1.254",
            "10.0.2.254",
            "10.0.4.254",
            "10.0.5.254",
            "10.0.6.254",
        ],
        "log_file": "./log/ping_ns2.log",
    },
    {
        "namespace": "ns4",
        "ip_list": ["10.0.2.1", "10.0.4.254"],
        "log_file": "./log/ping_ns4.log",
    },
    {
        "namespace": "ns5",
        "ip_list": ["10.0.2.1", "10.0.5.254"],
        "log_file": "./log/ping_ns5.log",
    },
    {
        "namespace": "ns6",
        "ip_list": ["10.0.2.1", "10.0.6.254"],
        "log_file": "./log/ping_ns6.log",
    },
]


# Main function to execute the ping test
if __name__ == "__main__":
    for i, test in enumerate(tests, start=1):
        print(f"{i}/{len(tests)}")
        ping_multiple_ips(test["namespace"], test["ip_list"], test["log_file"])
    print("Ping test completed!")
