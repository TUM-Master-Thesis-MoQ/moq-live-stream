from pyroute2 import netns
from pyroute2 import IPRoute
from pyroute2 import NetNS
from pyroute2.netlink.exceptions import NetlinkError

NAMESPACES = [
    {
        "name": "ns1",
        "routes": [
            {
                "dst": "10.0.2.0/24",
                "gateway": "10.0.1.2",
                "if": "v1p2",
            },
        ],
    },
    {
        "name": "ns2",
        "routes": [
            {
                "dst": "10.0.1.0/24",
                "gateway": "10.0.2.1",
                "if": "v2p1",
            },
            {
                "dst": "10.0.3.0/24",
                "gateway": "10.0.2.2",
                "if": "v2p2",
            },
            {
                "dst": "10.0.4.0/24",
                "gateway": "10.0.2.2",
                "if": "v2p2",
            },
        ],
    },
    {
        "name": "ns3",
        "routes": [
            {
                "dst": "10.0.2.0/24",
                "gateway": "10.0.3.2",
                "if": "v3p2",
            },
            {
                "dst": "10.0.4.0/24",
                "gateway": "10.0.3.2",
                "if": "v3p2",
            },
        ],
    },
    {
        "name": "ns4",
        "routes": [
            {
                "dst": "10.0.2.0/24",
                "gateway": "10.0.4.1",
                "if": "v4p1",
            },
            {
                "dst": "10.0.3.0/24",
                "gateway": "10.0.4.1",
                "if": "v4p1",
            },
            {
                "dst": "10.0.5.0/24",
                "gateway": "10.0.4.2",
                "if": "v4p2",
            },
        ],
    },
    {
        "name": "ns5",
        "routes": [
            {
                "dst": "10.0.4.0/24",
                "gateway": "10.0.5.1",
                "if": "v5p1",
            },
        ],
    },
]

BRIDGES = [
    {
        "name": "br1",
        "address": "10.0.5.253",
        "mask": 24,
    },
]

DEVICES = [
    {
        "name": "v1p1",  # streamer
        # "peer": "",
        "ns": "ns1",
        "ip": "10.0.1.1",
        "mask": 24,
        "broadcast": "10.0.1.255",
        # "bridge": "",
    },
    {
        "name": "v1p2",
        "peer": "v2p1",
        "ns": "ns1",
        "ip": "10.0.1.2",
        "mask": 24,
        "broadcast": "10.0.1.255",
        # "bridge": "",
    },
    {
        "name": "v2p1",
        "peer": "v1p2",
        "ns": "ns2",
        "ip": "10.0.2.1",
        "mask": 24,
        "broadcast": "10.0.2.255",
        # "bridge": "",
    },
    {
        "name": "v2p2",
        "peer": "v3p2",
        "ns": "ns2",
        "ip": "10.0.2.2",
        "mask": 24,
        "broadcast": "10.0.2.255",
        # "bridge": "",
    },
    {
        "name": "v2p2",
        "peer": "v4p1",
        "ns": "ns2",
        "ip": "10.0.2.2",
        "mask": 24,
        "broadcast": "10.0.2.255",
        # "bridge": "",
    },
    {
        "name": "v3p1",  # server
        # "peer": "",
        "ns": "ns3",
        "ip": "10.0.3.1",
        "mask": 24,
        "broadcast": "10.0.3.255",
        # "bridge": "",
    },
    {
        "name": "v3p2",
        "peer": "v2p2",
        "ns": "ns3",
        "ip": "10.0.3.2",
        "mask": 24,
        "broadcast": "10.0.3.255",
        # "bridge": "",
    },
    {
        "name": "v3p2",
        "peer": "v4p1",
        "ns": "ns3",
        "ip": "10.0.3.2",
        "mask": 24,
        "broadcast": "10.0.3.255",
        # "bridge": "",
    },
    {
        "name": "v4p1",
        "peer": "v2p2",
        "ns": "ns4",
        "ip": "10.0.4.1",
        "mask": 24,
        "broadcast": "10.0.4.255",
        # "bridge": "",
    },
    {
        "name": "v4p1",
        "peer": "v3p2",
        "ns": "ns4",
        "ip": "10.0.4.1",
        "mask": 24,
        "broadcast": "10.0.4.255",
        # "bridge": "",
    },
    {
        "name": "v4p2",
        "peer": "v5p1",
        "ns": "ns4",
        "ip": "10.0.4.2",
        "mask": 24,
        "broadcast": "10.0.4.255",
        # "bridge": "",
    },
    {
        "name": "v5p1",
        "peer": "v4p2",
        "ns": "ns5",
        "ip": "10.0.5.1",
        "mask": 24,
        "broadcast": "10.0.5.255",
        "bridge": "br1",
    },
    {
        "name": "br1",  # bridge
        # "peer": "",
        "ns": "ns5",
        "ip": "10.0.5.254",
        "mask": 24,
        "broadcast": "10.0.5.255",
        # "bridge": "",
    },
]

AUDIENCE_TEMP = {
    "name": "v5px",  # audience v5px where x = [2 - 253]
    "ns": "ns5",
    "ip": "10.0.5.x",
    "mask": 24,
    "broadcast": "10.0.5.255",
    "bridge": "br1",
}


def create_audience_devices(num_audiences):
    audience_devices = []
    for i in range(2, num_audiences + 1):
        device = AUDIENCE_TEMP.copy()
        device["name"] = device["name"].replace("x", str(i))
        device["ip"] = device["ip"].replace("x", str(i))
        audience_devices.append(device)
    return audience_devices


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
                ipr.addr("add", index=dev, address=br["address"], mask=br["mask"])
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


def create_iface():
    with IPRoute() as ipr:
        for config in DEVICES:
            try:
                # Create the veth pair only if a peer is defined
                if config.get("peer"):
                    ipr.link(
                        "add", ifname=config["name"], kind="veth", peer=config["peer"]
                    )
                    peer = ipr.link_lookup(ifname=config["peer"])[0]

                    # Set the bridge master only if a bridge is defined
                    if config.get("bridge"):
                        br = ipr.link_lookup(ifname=config["bridge"])[0]
                        ipr.link("set", index=peer, master=br)

                # Lookup the device
                dev = ipr.link_lookup(ifname=config["name"])[0]
                ipr.link("set", index=dev, net_ns_fd=config["ns"])

                # Configure namespace
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

                # Bring up the peer if it exists
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
                # iface = ns.link_lookup(ifname=route['if'])[0]
                ns.route("add", dst=route["dst"], gateway=route["gateway"])
                ns.close()
            except Exception as e:
                print(e, namespace, route)


def add_delay(ns_name, if_name, delay_us):
    with NetNS(ns_name) as ns:
        dev = ns.link_lookup(ifname=if_name)[0]
        ns.tc("add", "netem", index=dev, handle="1:", delay=delay_us)


def remove_delay(ns_name, if_name):
    if len(netns.listnetns()) == 0:
        return
    with NetNS(ns_name) as ns:
        dev = ns.link_lookup(ifname=if_name)[0]
        ns.tc("del", index=dev, handle="1:")


def add_bandwidth_limit(ns_name, if_name, rate, latency, burst):
    with NetNS(ns_name) as ns:
        dev = ns.link_lookup(ifname=if_name)[0]
        ns.tc(
            "add",
            "tbf",
            index=dev,
            handle="0:",
            parent="1:",
            rate=rate,
            latency=latency,
            burst=burst,
        )


def remove_bandwidth_limit(ns_name, if_name):
    with NetNS(ns_name) as ns:
        dev = ns.link_lookup(ifname=if_name)[0]
        ns.tc("del", index=dev, handle="0:", parent="1:")


def setup_tc():
    add_delay()
    add_bandwidth_limit()


def clear_tc():
    try:
        remove_bandwidth_limit()
    except Exception as e:
        print(e)
    try:
        remove_delay()
    except Exception as e:
        print(e)


def setup():
    create_ns()
    create_bridge()
    create_iface()
    create_routes()


def clean():
    remove_iface()
    remove_bridge()
    remove_ns()
