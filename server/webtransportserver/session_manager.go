package webtransportserver

import (
	"context"
	"encoding/json"
	"moqlivestream/component/channel/catalog"
	"moqlivestream/component/channelmanager"
	"net/http"
	"strings"

	"github.com/mengelbart/moqtransport"
)

// empty struct that groups session management functions
type sessionManager struct {
	subscribeId uint64
	trackAlias  uint64
}

func newSessionManager() *sessionManager {
	return &sessionManager{0, 0}
}

// // TODO: send first announce(channels) msg to audience when it connects
func (sm *sessionManager) announceChannels(ctx context.Context, s *moqtransport.Session) {
	err := s.Announce(ctx, "channels")
	if err != nil {
		log.Printf("❌ error announcing channels: %s", err)
	} else {
		log.Println("📢 Channels announcement sent:" + "channels")
	}
}

func (sm *sessionManager) HandleAnnouncement(publisherSession *moqtransport.Session, a *moqtransport.Announcement, arw moqtransport.AnnouncementResponseWriter) {
	// split namespace by "-" to get the channel name and track name
	ans := strings.Split(a.Namespace(), "-") // ["catalog", channelName]
	log.Printf("📢 Announcement received: %s", a.Namespace())
	switch ans[0] {
	case "catalog": //! A1: catalog JSON announcement
		// check if channel name is unique
		if !channelmanager.ChannelUnique(ans[1]) {
			arw.Reject(http.StatusConflict, "channel(namespace) already exists")
			return
		}
		log.Printf("📦 Catalog announcement received: %s", a.Namespace())
		arw.Accept()

		channel, err := channelmanager.GetChannelByName("tempChannel")
		if err != nil {
			log.Printf("❌ error getting channel: %s", err)
			arw.Reject(http.StatusNotFound, "channel(namespace) not found")
			return
		}
		channel.Name = ans[1] // update "tempChannel" name to real channel name
		log.Printf("🔔 Channel name updated to: %s", channel.Name)

		catalogTrack, err := publisherSession.Subscribe(context.Background(), 0, 0, a.Namespace(), "catalogTrack", "")
		if err != nil {
			log.Printf("❌ error subscribing to streamer-app's catalogTrack: %s", err)
			return
		} else {
			log.Printf("📦 Catalog file receiving...")
			o, err := catalogTrack.ReadObject(context.Background())
			if err != nil {
				log.Printf("❌ error reading catalog file: %s", err)
				return
			}
			catalogJSON, err := catalog.ParseCatalog(o.Payload)
			if err != nil {
				log.Printf("❌ error parsing catalog file: %s", err)
				return
			}
			channel.Catalog = catalogJSON
			log.Printf("📦 Channel Catalog set: %v", channel.Catalog)
			catalogTrack.Unsubscribe()
		}

	default: //! A0: regular announcement msg
		channelName := a.Namespace()
		channel, err := channelmanager.GetChannelByName(channelName)
		if err != nil { // should not happen
			log.Printf("❌ error getting channel: %s", err)
			arw.Reject(http.StatusNotFound, "channel(namespace) not found")
			return
		}
		arw.Accept()
		sm.subscribeToStreamerMediaTrack(publisherSession, channelName, channel.Catalog.Tracks[0].Name)
	}
}

// subscribe to media stream track from the streamer-app
func (sm *sessionManager) subscribeToStreamerMediaTrack(publisherSession *moqtransport.Session, namespace string, trackName string) {
	ctx := context.Background()
	channel, err := channelmanager.GetChannelByName(namespace)
	if err != nil {
		log.Printf("❌ error getting channel: %s", err)
		return
	}
	track := moqtransport.NewLocalTrack(namespace, trackName) // proper initialization of channel.Track (LocalTrack)
	channel.Session.AddLocalTrack(track)
	channel.Track = track //? save the track to the channel's track field
	sub, err := publisherSession.Subscribe(ctx, 1, 1, namespace, trackName, "")
	if err != nil {
		log.Printf("❌ error subscribing to streamer-app's catalogTrack: %s", err)
		return
	}
	log.Printf("🔔 Subscribed to streamer-app(%s)'s media stream track: %s", namespace, trackName)

	go func(remote *moqtransport.RemoteTrack, local *moqtransport.LocalTrack) {
		for {
			obj, err := remote.ReadObject(ctx)
			if err != nil {
				log.Printf("❌ error reading remote track object: %s", err)
				return
			}
			log.Printf("📦 Read Object from streamer: GroupID: %v, ObjectID: %v, Payload: %v bytes", obj.GroupID, obj.ObjectID, len(obj.Payload))
			if err := local.WriteObject(ctx, obj); err != nil {
				log.Printf("❌ error writing to local track: %s", err)
				return
			}
			log.Printf("📦 Write Object to channel: GroupID: %v, ObjectID: %v, Payload: %v bytes", obj.GroupID, obj.ObjectID, len(obj.Payload))
		}
	}(sub, channel.Track)
}

func (sm *sessionManager) HandleSubscription(subscriberSession *moqtransport.Session, s *moqtransport.Subscription, srw moqtransport.SubscriptionResponseWriter) {
	channel, err := channelmanager.GetChannelByName(s.Namespace)
	if err != nil {
		log.Printf("❌ error getting channel: %s", err)
		srw.Reject(http.StatusNotFound, "channel(namespace) not found")
		return
	}
	switch s.TrackName {
	case "channelListTrack": //! S1: request for channel list []string from server
		// create a new local track and write the channel list obj to the track directly
		if s.Namespace == "channels" {
			// // TODO: send channel list ([] string) file to the audience
			channelList := channelmanager.GetChannelNames() //TODO: return channel status later
			channelListBytes, err := json.Marshal(channelList)
			if err != nil {
				log.Printf("❌ error marshalling channel list: %s", err)
				srw.Reject(uint64(moqtransport.ErrorCodeInternal), "error marshalling channel list")
				return
			}
			track := moqtransport.NewLocalTrack(s.Namespace, s.TrackName)
			go func(local *moqtransport.LocalTrack) {
				if err := local.WriteObject(context.Background(), moqtransport.Object{GroupID: 0, ObjectID: 0, PublisherPriority: 0, ForwardingPreference: moqtransport.ObjectForwardingPreferenceStream, Payload: channelListBytes}); err != nil {
					log.Printf("❌ error writing channel list to local track: %s", err)
					return
				}
			}(track)
			srw.Accept(track)
		} else {
			srw.Reject(http.StatusConflict, "namespace is not 'channels' while trackName is 'channelListTrack'")
		}

	case "": //! S2: empty track name indicates request for ANNOUNCE with the requested channel name(namespace)
		// // TODO: send ANNOUNCE msg with the requested channel name(namespace)
		channel.Session.Announce(context.Background(), s.Namespace)

	case "catalogTrack": //! S3: request for catalog file of chosen channel(namespace)
		// // TODO: send requested catalog file to the audience
		track := moqtransport.NewLocalTrack(s.Namespace, s.TrackName)
		catalogBytes, err := channel.Catalog.Serialize()
		if err != nil {
			log.Printf("❌ error serializing catalog: %s", err)
			srw.Reject(uint64(moqtransport.ErrorCodeInternal), "error serializing catalog")
			return
		}
		go func(local *moqtransport.LocalTrack) {
			// TODO: proper increment of groupID, objectID
			if err := local.WriteObject(context.Background(), moqtransport.Object{GroupID: 0, ObjectID: 0, PublisherPriority: 0, ForwardingPreference: moqtransport.ObjectForwardingPreferenceStream, Payload: catalogBytes}); err != nil {
				log.Printf("❌ error writing catalog to local track: %s", err)
				return
			}
		}(track)
		srw.Accept(track)

	default: //! S0: regular track subscription
		// handle as regular track subscription, currently only supports copying media stream track from streamer-app to audience session
		// // TODO: transfer subscribed track from streamer-app to all audience sessions that subscribed to the same trackName
		// TODO: handle track subscription that the streamer is not streaming to the server (exp: md 720P video track).
		channelName := s.Namespace // channel name
		trackName := s.TrackName   // track name
		// add the audience session to the channel's track audience list with the track name
		// 1. get the channel obj with the channel name
		// 2. get the audience obj with the audience session pointer
		// 3. add the audience object to the channel's track audience list
		au, err := channel.GetAudienceBySession(subscriberSession)
		if err != nil {
			log.Printf("❌ error getting audience: %s", err)
			srw.Reject(http.StatusNotFound, "audience session not found")
			return
		}
		// add the audience to the track audience list
		channel.AddAudienceToTrack(trackName, au)
		log.Printf("🔔 Audience subscribed to (track) %s under (namespace): %s", trackName, channelName)

		// copy the media stream track (channel.Track) to the remote audience track
		srw.Accept(channel.Track)
	}
}
