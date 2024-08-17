package main

import (
	"moqlivestream/component/channelmanager"
	"moqlivestream/server/webtransportserver"
)

func main() {
	channelmanager.InitChannelManager()

	go func() { webtransportserver.StartServer() }()
	select {}
}
