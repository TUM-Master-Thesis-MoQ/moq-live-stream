from pyroute2 import netns
from pyroute2 import IPRoute
from pyroute2 import NetNS
from pyroute2.netlink.exceptions import NetlinkError

NAMESPACES = [
    {
        "name": "ns1",  # streamer namespace
        "routes": [
            {
                "dst": "10.0.2.0/24",
                "gateway": "10.0.1.1",
            }
        ],
    },
    {
        "name": "ns2",  # server namespace
        "routes": [
            {
                "dst": "10.0.1.0/24",  # streamer subnet
                "gateway": "10.0.2.1",
            },
            {
                "dst": "10.0.4.0/24",  # audience 1 subnet
                "gateway": "10.0.2.1",
            },
            {
                "dst": "10.0.5.0/24",  # audience 2 subnet
                "gateway": "10.0.2.1",
            },
            {
                "dst": "10.0.6.0/24",  # audience 3 subnet
                "gateway": "10.0.2.1",
            },
        ],
    },
    {
        "name": "ns4",  # audience 1 namespace
        "routes": [
            {
                "dst": "10.0.2.0/24",
                "gateway": "10.0.4.1",
            },
        ],
    },
    {
        "name": "ns5",  # audience 2 namespace
        "routes": [
            {
                "dst": "10.0.2.0/24",
                "gateway": "10.0.5.1",
            },
        ],
    },
    {
        "name": "ns6",  # audience 3 namespace
        "routes": [
            {
                "dst": "10.0.2.0/24",
                "gateway": "10.0.6.1",
            },
        ],
    },
]

BRIDGES = [
    {
        "name": "br1",
    },
    {
        "name": "br2",
    },
]

# veth pairs to connect bridges, one set
BRIDGE_CONNECTIONS = [
    {
        "br1_name": "br1",
        "br2_name": "br2",
        "br1_iface": "v3p1",
        "br2_iface": "v3p2",
    },
]

DEVICES = [
    {
        "name": "v1p1",  # streamer iface
        "peer": "v1p2",
        "ns": "ns1",
        "ip": "10.0.1.1",
        "mask": 24,
        "broadcast": "10.0.1.255",
        "bridge": "br1",
    },
    {
        "name": "v2p1",  # server iface
        "peer": "v2p2",
        "ns": "ns2",
        "ip": "10.0.2.1",
        "mask": 24,
        "broadcast": "10.0.2.255",
        "bridge": "br1",
    },
    {
        "name": "v4p1",  # audience 1 iface
        "peer": "v4p2",
        "ns": "ns4",
        "ip": "10.0.4.1",
        "mask": 24,
        "broadcast": "10.0.4.255",
        "bridge": "br2",
    },
    {
        "name": "v5p1",  # audience 2 iface
        "peer": "v5p2",
        "ns": "ns5",
        "ip": "10.0.5.1",
        "mask": 24,
        "broadcast": "10.0.5.255",
        "bridge": "br2",
    },
    {
        "name": "v6p1",  # audience 3 iface
        "peer": "v6p2",
        "ns": "ns6",
        "ip": "10.0.6.1",
        "mask": 24,
        "broadcast": "10.0.6.255",
        "bridge": "br2",
    },
]

# AUDIENCE_TEMP = {
#     "name": "v5px",  # audience v5px where x = [2 - 253]
#     "ns": "ns5",
#     "ip": "10.0.5.x",
#     "mask": 24,
#     "broadcast": "10.0.5.255",
#     "bridge": "br1",
# }


# def create_audience_devices(num_audiences):
#     audience_devices = []
#     for i in range(2, num_audiences + 1):
#         device = AUDIENCE_TEMP.copy()
#         device["name"] = device["name"].replace("x", str(i))
#         device["ip"] = device["ip"].replace("x", str(i))
#         audience_devices.append(device)
#     return audience_devices


def create_ns():
    for ns in NAMESPACES:
        try:
            netns.create(ns["name"])
        except Exception as e:
            print(e)


def remove_ns():
    for ns in NAMESPACES:
        try:
            netns.remove(ns["name"])
        except FileNotFoundError:
            continue
        except Exception as e:
            print(f"{e}:", type(e).__name__)


def create_bridge():
    with IPRoute() as ipr:
        for br in BRIDGES:
            try:
                ipr.link("add", ifname=br["name"], kind="bridge")
                dev = ipr.link_lookup(ifname=br["name"])[0]
                ipr.link("set", index=dev, state="up")
            except Exception as e:
                print(f"error: {e}, while creating bridge: {br}")


def remove_bridge():
    with IPRoute() as ipr:
        for br in BRIDGES:
            try:
                ipr.link("del", ifname=br["name"])
            except NetlinkError as e:
                if e.code == 19:  # No such device
                    continue
                print(f"{e}:", type(e).__name__)


def create_bridge_connections():
    with IPRoute() as ipr:
        for conn in BRIDGE_CONNECTIONS:
            try:
                br1_iface = conn["br1_iface"]
                br2_iface = conn["br2_iface"]

                ipr.link("add", ifname=br1_iface, kind="veth", peer=br2_iface)

                br1 = ipr.link_lookup(ifname=conn["br1_name"])[0]
                br2 = ipr.link_lookup(ifname=conn["br2_name"])[0]

                br1_dev = ipr.link_lookup(ifname=br1_iface)[0]
                br2_dev = ipr.link_lookup(ifname=br2_iface)[0]

                ipr.link("set", index=br1_dev, master=br1)
                ipr.link("set", index=br2_dev, master=br2)

                ipr.link("set", index=br1, state="up")
                ipr.link("set", index=br2, state="up")

                ipr.link("set", index=br1_dev, state="up")
                ipr.link("set", index=br2_dev, state="up")
            except Exception as e:
                print(f"error: {e}, while connecting bridge: {conn}")


def remove_bridge_connections():
    with IPRoute() as ipr:
        for conn in BRIDGE_CONNECTIONS:
            try:
                br1_devs = ipr.link_lookup(ifname=conn["br1_iface"])
                if len(br1_devs) > 0:
                    ipr.link("del", index=br1_devs[0])
            except Exception as e:
                print(f"error: {e}, while removing bridge connection: {conn}")


def create_iface():
    with IPRoute() as ipr:
        for config in DEVICES:
            try:
                # Create veth pair
                ipr.link("add", ifname=config["name"], kind="veth", peer=config["peer"])
                peer = ipr.link_lookup(ifname=config["peer"])[0]

                # Set bridge master
                br = ipr.link_lookup(ifname=config["bridge"])[0]
                ipr.link("set", index=peer, master=br)

                # Lookup the device
                dev = ipr.link_lookup(ifname=config["name"])[0]

                # config device in namespace
                if config.get("ns"):
                    ipr.link("set", index=dev, net_ns_fd=config["ns"])
                    ns = NetNS(config["ns"])
                    ns.addr(
                        "add",
                        index=dev,
                        address=config["ip"],
                        mask=config["mask"],
                        broadcast=config["broadcast"],
                    )
                    ns.link("set", index=dev, state="up")
                    lo = ns.link_lookup(ifname="lo")[0]
                    ns.link("set", index=lo, state="up")
                    ns.close()

                # bring up the bridge iface
                if config.get("peer"):
                    ipr.link("set", index=peer, state="up")

            except Exception as e:
                print(f"{type(e).__name__}: {e}, config: {config}")


def remove_iface():
    with IPRoute() as ipr:
        for config in DEVICES:
            try:
                devs = ipr.link_lookup(ifname=config["name"])
                peers = ipr.link_lookup(ifname=config["peer"])
                if len(devs) > 0:
                    ipr.link("del", index=devs[0])
                if len(peers) > 0:
                    ipr.link("del", index=peers[0])
            except Exception as e:
                print(f"{e}: ", type(e).__name__)


def create_routes():
    for namespace in NAMESPACES:
        for route in namespace["routes"]:
            try:
                ns = NetNS(namespace["name"])
                ns.route("add", dst=route["dst"], gateway=route["gateway"])
                ns.close()
            except Exception as e:
                print(e, namespace, route)


def add_delay(if_name, delay_us):
    """
    Add delay(in ms) to a network interface using netem qdisc.

    Parameters:
    if_name (str): The name of the network interface.
    delay_us (int): The delay to add in milliseconds.
    """
    with IPRoute() as ipr:
        dev = ipr.link_lookup(ifname=if_name)[0]
        if not dev:
            print(f"Device {if_name} not found")
            return
        try:
            ipr.tc("add", "netem", index=dev, handle="1:", delay=delay_us * 1000)
            print(f"Added delay to {if_name}: {delay_us}ms")
        except Exception as e:
            print(f"Failed to add delay to {if_name}: {e}")


def remove_delay(if_name):
    with IPRoute() as ipr:
        dev = ipr.link_lookup(ifname=if_name)[0]
        ipr.tc("del", index=dev, handle="1:")


def add_bandwidth_limit(if_name, rate, burst, latency):
    """
    Add bandwidth limit to a network interface using TBF.

    Parameters:
    if_name (str): The name of the network interface.
    rate (str): The rate at which traffic is allowed to pass (e.g., '10mbit').
    latency (float): The maximum amount of time a packet can wait in the queue in milliseconds.
    burst (int): The maximum amount of data that can be sent in a burst in bytes.
    """
    with IPRoute() as ipr:
        dev = ipr.link_lookup(ifname=if_name)[0]
        if not dev:
            print(f"Device {if_name} not found")
            return
        try:
            ipr.tc(
                "add",
                "tbf",
                index=dev,
                handle="0:",
                parent="1:",
                rate=rate,
                latency=latency / 1000,  # queuing delay, accept in seconds
                burst=burst,
            )
            print(
                f"Added bandwidth limit to {if_name}: rate={rate}, burst(buffer)={burst}bytes, queuing delay={latency}ms"
            )
        except Exception as e:
            print(f"Failed to add bandwidth limit to {if_name}: {e}")


def remove_bandwidth_limit(if_name):
    with IPRoute() as ipr:
        dev = ipr.link_lookup(ifname=if_name)[0]
        ipr.tc("del", index=dev, handle="0:", parent="1:")


def setup_tc():
    # call add_delay() first to ensure netem qdisc is set up so ipr.tc() in add_bandwidth_limit() can find it

    # streamer to server
    add_delay("v1p2", 10)
    add_bandwidth_limit("v1p2", "10mbit", 10000, 0)

    # # server to audience bridge (br2)
    # add_delay("v3p2", 15000)
    # add_bandwidth_limit("v3p2", "10mbit", 10000,0)

    # # individual audience iface on br2
    add_delay("v4p2", 5)
    add_bandwidth_limit("v4p2", "5mbit", 10000, 0)

    add_delay("v5p2", 10)
    add_bandwidth_limit("v5p2", "10mbit", 10000, 0)

    add_delay("v6p2", 20)
    add_bandwidth_limit("v6p2", "20mbit", 10000, 0)


def clear_tc():
    try:
        remove_bandwidth_limit("v1p2")
        # remove_bandwidth_limit("v3p2")

        remove_bandwidth_limit("v4p2")
        remove_bandwidth_limit("v5p2")
        remove_bandwidth_limit("v6p2")
    except Exception as e:
        print(e)
    try:
        remove_delay("v1p2")
        # remove_delay("v3p2")

        remove_delay("v4p2")
        remove_delay("v5p2")
        remove_delay("v6p2")
    except Exception as e:
        print(e)


def setup():
    create_ns()
    create_bridge()
    create_bridge_connections()
    create_iface()
    create_routes()


def clean():
    remove_iface()
    remove_bridge()
    remove_bridge_connections()
    remove_ns()
