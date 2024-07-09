package main

import (
	"moqlivestream/component/channelmanager"
	"moqlivestream/server/webtransportserver"
)

func main() {
	go func() { webtransportserver.StartServer() }()

	channelmanager.InitChannelManager()

	// Block the main goroutine to keep the server running
	select {}
}
