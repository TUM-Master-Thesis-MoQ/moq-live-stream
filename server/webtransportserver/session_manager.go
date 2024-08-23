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

// // TODO: send first announce(channels) msg to audience when it connects
func (sm *sessionManager) announceChannels(s *moqtransport.Session) {
	s.Announce(context.Background(), "channels")
}

func (sm *sessionManager) HandleAnnouncement(publisherSession *moqtransport.Session, a *moqtransport.Announcement, arw moqtransport.AnnouncementResponseWriter) {
	// split namespace by "-" to get the channel name and track name
	ans := strings.Split(a.Namespace(), "-") // ["catalog", channelName]
	switch ans[0] {
	case "catalog": //! A1: catalog JSON announcement
		arw.Accept()
		channel, err := channelmanager.GetChannelByName("tempChannel")
		if err != nil {
			log.Printf("❌ error getting channel: %s", err)
			arw.Reject(http.StatusNotFound, "channel(namespace) not found")
			return
		}
		channel.Name = ans[1] // replace the tempChannel name with the actual channel name
		// // TODO: subscribe to publisherSession (catalog, sub)
		sub, err := channel.Session.Subscribe(context.Background(), sm.subscribeId+1, sm.trackAlias+1, a.Namespace(), "catalogTrack", "")
		if err != nil {
			log.Printf("❌ error subscribing to streamer-app's catalogTrack: %s", err)
			return
		}
		// ? is this the correct way to handle the catalog file?
		go func(remote *moqtransport.RemoteTrack) {
			catalogObj, err := remote.ReadObject(context.Background())
			if err != nil {
				log.Printf("❌ error reading catalog file: %s", err)
				return
			}
			catalogJSON, err := catalog.ParseCatalog(catalogObj.Payload)
			if err != nil {
				log.Printf("❌ error parsing catalog file: %s", err)
				return
			}
			channel.Catalog = catalogJSON
			remote.Unsubscribe()
		}(sub)

	default: //! A0: regular announcement msg
		channelName := a.Namespace()
		if channelmanager.ChannelUnique(channelName) {
			arw.Accept()
			// // TODO: subscribe to a channel's default track
			channel, err := channelmanager.GetChannelByName(channelName)
			if err != nil {
				log.Printf("❌ error getting channel: %s", err)
				arw.Reject(http.StatusNotFound, "channel(namespace) not found")
				return
			}
			// // TODO: subscribeId, trackAlias management and what's auth string's functionality?
			sm.subscribeToStreamerMediaTrack(publisherSession, context.Background(), 0, 0, channelName, channel.Catalog.Tracks[0].Name, "")

		} else {
			arw.Reject(http.StatusConflict, "channel(namespace) already exists")
			return
		}
	}
}

// subscribe to media stream track from the streamer-app
func (sm *sessionManager) subscribeToStreamerMediaTrack(publisherSession *moqtransport.Session, ctx context.Context, subscribeID uint64, trackAlias uint64, namespace string, trackName string, auth string) {
	channel, err := channelmanager.GetChannelByName(namespace)
	if err != nil {
		log.Printf("❌ error getting channel: %s", err)
		return
	}
	track := moqtransport.NewLocalTrack(0, namespace, trackName) // proper initialization of channel.Track (LocalTrack)
	channel.Session.AddLocalTrack(track)
	channel.Track = track
	sub, err := channel.Session.Subscribe(ctx, sm.subscribeId+1, sm.trackAlias+1, namespace, trackName, auth)
	if err != nil {
		log.Printf("❌ error subscribing to streamer-app's catalogTrack: %s", err)
		return
	}
	// // TODO: then write the objs got in sub to the channel session's LocalTrack so audiences sub to channel's track can get the stream

	go func(remote *moqtransport.RemoteTrack, local *moqtransport.LocalTrack) {
		// // TODO: read obj from remote streamer track and write to local channel track (forward remote media stream track to subscribed audience sessions)
		for {
			obj, err := remote.ReadObject(ctx)
			if err != nil {
				log.Printf("❌ error reading remote track object: %s", err)
				return
			}
			if err := local.WriteObject(ctx, obj); err != nil {
				log.Printf("❌ error writing to local track: %s", err)
				return
			}
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
			track := moqtransport.NewLocalTrack(0, s.Namespace, s.TrackName)
			go func(local *moqtransport.LocalTrack) {
				if err := local.WriteObject(context.Background(), moqtransport.Object{GroupID: 0, ObjectID: 0, ObjectSendOrder: 0, ForwardingPreference: moqtransport.ObjectForwardingPreferenceStream, Payload: channelListBytes}); err != nil {
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
		track := moqtransport.NewLocalTrack(0, s.Namespace, s.TrackName)
		catalogBytes, err := channel.Catalog.Serialize()
		if err != nil {
			log.Printf("❌ error serializing catalog: %s", err)
			srw.Reject(uint64(moqtransport.ErrorCodeInternal), "error serializing catalog")
			return
		}
		go func(local *moqtransport.LocalTrack) {
			// TODO: proper increment of groupID, objectID
			if err := local.WriteObject(context.Background(), moqtransport.Object{GroupID: 0, ObjectID: 0, ObjectSendOrder: 0, ForwardingPreference: moqtransport.ObjectForwardingPreferenceStream, Payload: catalogBytes}); err != nil {
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
