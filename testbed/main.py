#!/usr/bin/env python3

import argparse

from network.network import setup, clean, setup_tc, clear_tc


def setup_cmd(args):
    print("Setting up network")
    setup()


def clean_cmd(args):
    print("Cleaning up network")
    clean()


def setup_tc_cmd(args):
    print("Setting up tc")
    setup_tc()


def clear_tc_cmd(args):
    print("Clearing tc")
    clear_tc()


def main():
    parser = argparse.ArgumentParser(
        formatter_class=argparse.ArgumentDefaultsHelpFormatter
    )
    subparsers = parser.add_subparsers(help="sub-command help", required=True)

    clean = subparsers.add_parser(
        "clean", help="clean up virtual interfaces and namespaces"
    )
    clean.set_defaults(func=clean_cmd)

    setup = subparsers.add_parser(
        "setup", help="setup virtual interfaces and namespaces"
    )
    setup.set_defaults(func=setup_cmd)

    setup_tc = subparsers.add_parser("tc", help="add netem delay qdisc")
    setup_tc.set_defaults(func=setup_tc_cmd)

    clean_tc = subparsers.add_parser("clear", help="remove any tc qdiscs")
    clean_tc.set_defaults(func=clear_tc_cmd)

    args = parser.parse_args()
    if hasattr(args, "func"):
        args.func(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
