package webtransportserver

import (
	"context"
	"encoding/json"
	"moqlivestream/component/audience"
	"moqlivestream/component/channel/catalog"
	"moqlivestream/component/channelmanager"
	"moqlivestream/component/streamer"
	"net/http"

	"github.com/mengelbart/moqtransport"
)

// empty struct that groups session management functions
type sessionManager struct {
	// subscribeId uint64 // saved for later use
	// trackAlias  uint64 // saved for later use
	streamer *streamer.Streamer
	audience *audience.Audience
}

func newSessionManager(streamer *streamer.Streamer, audience *audience.Audience) *sessionManager {
	return &sessionManager{streamer, audience}
}

func (sm *sessionManager) HandleAnnouncement(publisherSession *moqtransport.Session, a *moqtransport.Announcement, arw moqtransport.AnnouncementResponseWriter) {
	log.Printf("📢 Announcement received: %s", a.Namespace())
	//! A0: a.Namespace() = channel name
	if !channelmanager.ChannelUnique(a.Namespace()) {
		arw.Reject(http.StatusConflict, "channel(namespace) already exists")
		return
	}
	arw.Accept()

	sm.streamer.Name = a.Namespace()
	channel := sm.streamer.Channel
	channel.Name = a.Namespace()
	log.Printf("🔔 Streamer & Channel name updated to: %s", a.Namespace())

	//! S2: sub to catalogTrack for catalog file
	catalogTrack, err := publisherSession.Subscribe(context.Background(), 0, 0, a.Namespace(), "catalogTrack", "")
	if err != nil {
		log.Printf("❌ error subscribing to streamer-app's catalogTrack: %s", err)
		return
	}
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

	//! S0: sub to media track => default video track & audio track
	// TODO: update track sub on demand (pending multiple audio track support)
	go sm.subscribeToStreamerMediaTrack(publisherSession, 1, 1, channel.Name, "audio")                        // subscribe to default audio track ("audio")
	go sm.subscribeToStreamerMediaTrack(publisherSession, 2, 2, channel.Name, channel.Catalog.Tracks[0].Name) // subscribe to default video track (tracks[0]name = "hd")
}

func (sm *sessionManager) subscribeToStreamerMediaTrack(publisherSession *moqtransport.Session, subscribeID uint64, trackAlias uint64, namespace string, trackName string) {
	ctx := context.Background()
	channel := sm.streamer.Channel
	track := moqtransport.NewLocalTrack(namespace, trackName)
	channel.Session.AddLocalTrack(track)
	channel.Tracks[trackName] = track
	sub, err := publisherSession.Subscribe(ctx, subscribeID, trackAlias, namespace, trackName, "")
	if err != nil {
		log.Printf("❌ error subscribing to streamer-app's catalogTrack: %s", err)
		return
	}
	log.Printf("🔔 Subscribed to channel(%s)'s media track: %s", namespace, trackName)

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
	}(sub, channel.Tracks[trackName])
}

func writeMetaObject(session *moqtransport.Session, namespace string, trackName string, groupID uint64, objectID uint64, publisherPriority uint8, payload []byte, srw moqtransport.SubscriptionResponseWriter) {
	track := moqtransport.NewLocalTrack(namespace, trackName)
	session.AddLocalTrack(track)
	go func(local *moqtransport.LocalTrack) {
		if err := local.WriteObject(context.Background(), moqtransport.Object{GroupID: groupID, ObjectID: objectID, PublisherPriority: publisherPriority, ForwardingPreference: moqtransport.ObjectForwardingPreferenceStream, Payload: payload}); err != nil {
			log.Printf("❌ error writing meta object to local track: %s", err)
			return
		}
		log.Printf("📦 Meta Object written to track: GroupID: %v, ObjectID: %v, Payload: %v bytes", groupID, objectID, len(payload))
	}(track)
	srw.Accept(track)
}

func (sm *sessionManager) HandleSubscription(subscriberSession *moqtransport.Session, s *moqtransport.Subscription, srw moqtransport.SubscriptionResponseWriter) {
	log.Printf("🔔 Subscription received: %s", s.TrackName)
	switch s.Namespace {
	case "channels": //! S1: request for channel list []string from server
		channelList := channelmanager.GetChannelNames() //TODO: return channel status later
		channelListBytes, err := json.Marshal(channelList)
		if err != nil {
			log.Printf("❌ error marshalling channel list: %s", err)
			srw.Reject(uint64(moqtransport.ErrorCodeInternal), "error marshalling channel list")
			return
		}

		writeMetaObject(sm.audience.Session, s.Namespace, s.TrackName, 0, 0, 0, channelListBytes, srw)

	default:
		switch s.TrackName {
		case "catalogTrack": //! S2: request for catalogTracks of chosen channel(namespace)
			log.Printf("🔔 CatalogTrack request: %s", s.TrackName)

			channel, err := channelmanager.GetChannelByName(s.Namespace)
			if err != nil {
				log.Printf("❌ error getting channel: %s", err)
				srw.Reject(http.StatusNotFound, "channel not found")
				return
			}
			catalogTracksBytes, err := channel.Catalog.SerializeTracks()
			if err != nil {
				log.Printf("❌ error serializing catalog: %s", err)
				srw.Reject(uint64(moqtransport.ErrorCodeInternal), "error serializing catalog")
				return
			}

			writeMetaObject(sm.audience.Session, s.Namespace, s.TrackName, 0, 1, 0, catalogTracksBytes, srw)

		default: //! S0: regular track subscription
			// TODO: handle media track sub change from default to other tracks
			// 1. get the channel obj with the channel name
			// 2. get the audience obj with the audience session pointer
			// 3. add the audience object to the channel's track audience list // add the audience session to the channel's track audience list with the track name

			channel, err := channelmanager.GetChannelByName(s.Namespace)
			if err != nil {
				log.Printf("❌ error getting channel: %s", err)
				srw.Reject(http.StatusNotFound, "channel not found")
				return
			}

			channel.AddAudienceToTrack(s.TrackName, sm.audience)

			track := moqtransport.NewLocalTrack(s.Namespace, s.TrackName)
			channel.Session.AddLocalTrack(track)

			srw.Accept(channel.Tracks[s.TrackName])
		}
	}
}
