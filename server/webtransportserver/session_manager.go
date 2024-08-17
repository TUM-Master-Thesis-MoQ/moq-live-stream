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
type sessionManager struct{}

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
		sub, err := publisherSession.Subscribe(context.Background(), 0, 0, a.Namespace(), "catalogTrack", "")
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
			subscribeToStreamerMediaTrack(publisherSession, context.Background(), 0, 0, channelName, channel.Catalog.Tracks[0].Name, "")

		} else {
			arw.Reject(http.StatusConflict, "channel(namespace) already exists")
			return
		}
	}
}

// subscribe to media stream track from the streamer-app
func subscribeToStreamerMediaTrack(publisherSession *moqtransport.Session, ctx context.Context, subscribeID uint64, trackAlias uint64, namespace string, trackName string, auth string) {
	sub, err := publisherSession.Subscribe(ctx, subscribeID, trackAlias, namespace, trackName, auth)
	if err != nil {
		log.Printf("❌ error subscribing to streamer-app's default track: %s", err)
		return
	}
	channel, err := channelmanager.GetChannelByName(namespace)
	if err != nil {
		log.Printf("❌ error getting channel: %s", err)
		return
	}
	channel.Session.AddLocalTrack(moqtransport.NewLocalTrack(0, namespace, trackName))
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
	switch s.TrackName {
	case "channelListTrack": //! S1: request for channel list []string from server
		if s.Namespace == "channels" {
			// TODO: send channel list ([] string) file to the audience
		} else {
			srw.Reject(http.StatusConflict, "namespace is not 'channels' while trackName is 'channelListTrack'")
		}

	case "": // S2: empty track name indicates request for ANNOUNCE with the requested channel name(namespace)
		// TODO: send ANNOUNCE msg with the requested channel name(namespace)
		subscriberSession.Announce(context.Background(), s.Namespace)

	case "catalogTrack": //! S3: request for catalog file of chosen channel(namespace)
		channel, err := channelmanager.GetChannelByName(s.Namespace)
		if err != nil {
			log.Printf("❌ error getting channel: %s", err)
			srw.Reject(http.StatusNotFound, "channel(namespace) not found")
			return
		}
		tracks := channel.Catalog.Tracks
		tracksBytes, err := json.Marshal(tracks)
		if err != nil {
			log.Printf("❌ error marshalling tracks: %s", err)
			srw.Reject(uint64(moqtransport.ErrorCodeInternal), "error marshalling tracks")
			return
		}
		log.Printf("🔔 Tracks prepared for sending: %v, (%v bytes)", tracks, len(tracksBytes))
	// TODO: send requested catalog file to the audience

	default: //! S0: regular track subscription
		// handle as regular track subscription, currently only supports copying media stream track from streamer-app to audience session
		// TODO: transfer subscribed track from streamer-app to all audience sessions that subscribed to the same trackName
		// TODO: handle track subscription that the streamer is not streaming to the server (exp: md 720P video track).
		channelName := s.Namespace // channel name
		trackName := s.TrackName   // track name
		// add the audience session to the channel's track audience list with the track name
		// 1. get the channel obj with the channel name
		// 2. get the audience obj with the audience session pointer
		// 3. add the audience object to the channel's track audience list
		ch, err := channelmanager.GetChannelByName(channelName)
		if err != nil {
			log.Printf("❌ error getting channel: %s", err)
			srw.Reject(http.StatusNotFound, "channel(namespace) not found")
			return
		}
		au, err := ch.GetAudienceBySession(subscriberSession)
		if err != nil {
			log.Printf("❌ error getting audience: %s", err)
			srw.Reject(http.StatusNotFound, "audience session not found")
			return
		}
		// add the audience to the track audience list
		ch.AddAudienceToTrack(trackName, au)
		log.Printf("🔔 Audience subscribed to (track) %s under (namespace): %s", trackName, channelName)

		// track registration
		// TODO: copy the media stream track to the remote audience session's LocalTrack (havnot define media stream track yet)
		if err := subscriberSession.AddLocalTrack(moqtransport.NewLocalTrack(0, channelName, trackName)); err != nil {
			log.Printf("❌ error adding local track: %s", err)
			srw.Reject(uint64(moqtransport.ErrorCodeInternal), "error adding local track")
			return
		}
		srw.Accept(ch.Track)
	}
}
