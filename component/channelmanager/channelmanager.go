package channelmanager

import (
	"errors"
	"moqlivestream/component/channel"
	"moqlivestream/component/streamer"
	"moqlivestream/utilities"
	"sync"
)

var log = utilities.NewCustomLogger()

type ChannelManager struct {
	Channels  []*channel.Channel
	Streamers []*streamer.Streamer
	mutex     sync.Mutex
}

var (
	cm     *ChannelManager
	cmOnce sync.Once
)

func InitChannelManager() *ChannelManager {
	cmOnce.Do(func() {
		cm = &ChannelManager{
			Channels:  []*channel.Channel{},
			Streamers: []*streamer.Streamer{},
		}
		log.Println("🪵 ChannelManager initialized")
	})
	return cm
}

// initialize a new streamer and Channel, and add the Channel to the ChannelManager's Channels list
func InitStreamer(channelName string, defaultTrackName string) (*streamer.Streamer, error) {
	cm := InitChannelManager()

	cm.mutex.Lock()
	defer cm.mutex.Unlock()

	// check if channel name is unique
	if !ChannelUnique(channelName) {
		if channelName == "tempChannel" {
			return nil, errors.New("channel registration not available, tempChannel name in use ")
		}
		return nil, errors.New("channel name already exists")
	}

	newStreamer := streamer.NewStreamer(channelName)
	newStreamer.Channel = channel.NewChannel(0, channelName, defaultTrackName)

	cm.Channels = append(cm.Channels, newStreamer.Channel)
	cm.Streamers = append(cm.Streamers, newStreamer)
	return newStreamer, nil
}

// remove a Streamer from the ChannelManager's Streamers list
func RemoveStreamer(name string) error {
	cm := InitChannelManager()

	cm.mutex.Lock()
	defer cm.mutex.Unlock()

	for i, st := range cm.Streamers {
		if st.Channel.Name == name {
			cm.Streamers = append(cm.Streamers[:i], cm.Streamers[i+1:]...)
			return nil
		}
	}
	for i, ch := range cm.Channels {
		if ch.Name == name {
			cm.Channels = append(cm.Channels[:i], cm.Channels[i+1:]...)
			return nil
		}
	}
	return errors.New("streamer not found")
}

// get a list of names of all Channels
func GetChannelNames() []string {
	cm := InitChannelManager()

	channelNames := make([]string, len(cm.Channels))
	for i, ch := range cm.Channels {
		channelNames[i] = ch.Name
	}
	return channelNames
}

// get a Channel by name
func GetChannelByName(name string) (*channel.Channel, error) {
	cm := InitChannelManager()

	for _, ch := range cm.Channels {
		if ch.Name == name {
			return ch, nil
		}
	}
	return nil, errors.New("channel not found")
}

// check for channel name uniqueness
func ChannelUnique(name string) bool {
	cm := InitChannelManager()

	for _, ch := range cm.Channels {
		if ch.Name == name {
			return false
		}
	}
	return true
}

// get Channel Status for announcement
type ChannelStatus struct {
	Name   string
	Status bool
}

// get a list of all Channels with their current status: map[uuid]struct[name, status]
func AnnounceChannelStatus() []ChannelStatus {
	cm := InitChannelManager()

	channelStatus := make([]ChannelStatus, len(cm.Channels))
	for id, ch := range cm.Channels {
		channelStatus[id] = ChannelStatus{
			Name:   ch.Name,
			Status: ch.Status,
		}
	}
	return channelStatus
}
