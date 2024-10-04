from pyroute2 import netns
from pyroute2 import IPRoute
from pyroute2 import NetNS
from pyroute2.netlink.exceptions import NetlinkError

NAMESPACES = [
    {
        "name": "ns1",  # streamer namespace
    },
    {
        "name": "ns2",  # server namespace
    },
    {
        "name": "ns4",  # audience 1 namespace
    },
    {
        "name": "ns5",  # audience 2 namespace
    },
    {
        "name": "ns6",  # audience 3 namespace
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
        "name": "v3p1",  # br connection iface on br1
        "peer": "v3p2",
        "bridge": "br2",
    },
    {
        "name": "v3p2",  # br connection iface on br2
        "peer": "v3p1",
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


def add_delay(if_name, delay_us):
    with IPRoute() as ipr:
        dev = ipr.link_lookup(ifname=if_name)[0]
        ipr.tc("add", "netem", index=dev, handle="1:", delay=delay_us)


def remove_delay(if_name):
    with IPRoute() as ipr:
        dev = ipr.link_lookup(ifname=if_name)[0]
        ipr.tc("del", index=dev, handle="1:")


def add_bandwidth_limit(if_name, rate, latency, burst):
    with IPRoute() as ipr:
        dev = ipr.link_lookup(ifname=if_name)[0]
        ipr.tc(
            "add",
            "tbf",
            index=dev,
            handle="0:",
            parent="1:",
            rate=rate,
            latency=latency,
            burst=burst,
        )


def remove_bandwidth_limit(if_name):
    with IPRoute() as ipr:
        dev = ipr.link_lookup(ifname=if_name)[0]
        ipr.tc("del", index=dev, handle="0:", parent="1:")


def setup_tc():
    # streamer to server
    add_delay("v1p2", 10000)
    add_bandwidth_limit("v1p2", "10mbit", "50ms", "10000")

    # # server to audience bridge (br2)
    # add_delay("v3p2", 10000)
    # add_bandwidth_limit("v3p2", "10mbit", "50ms", "10000")

    # individual audience iface on br2
    add_delay("v4p2", 5000)
    add_bandwidth_limit("v4p2", "5mbit", "10ms", "10000")

    add_delay("v5p2", 10000)
    add_bandwidth_limit("v5p2", "10mbit", "30ms", "10000")

    add_delay("v6p2", 10000)
    add_bandwidth_limit("v6p2", "20mbit", "50ms", "10000")


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
    create_iface()


def clean():
    remove_iface()
    remove_bridge()
    remove_ns()
