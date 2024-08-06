package main

import (
	"moqlivestream/component/channelmanager"
	"moqlivestream/server/webtransportserver"
)

func main() {
	channelmanager.InitChannelManager()

	s := webtransportserver.NewServer(":443")
	s.StartServer()
}
