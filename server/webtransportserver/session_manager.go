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
	// subscribe to all tracks in the catalog: audio, hd, md, hd-ra, md-ra
	for i := 0; i < len(channel.Catalog.Tracks); i++ {
		// for i := 0; i < 2; i++ { //! testbed: latency test_0
		go sm.subscribeToStreamerMediaTrack(publisherSession, uint64(i+1), uint64(i+1), channel.Name, channel.Catalog.Tracks[i].Name)
	}
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
			// log.Printf("📦 Read Object from streamer: GroupID: %v, ObjectID: %v, Payload: %v bytes", obj.GroupID, obj.ObjectID, len(obj.Payload))
			if err := local.WriteObject(ctx, obj); err != nil {
				log.Printf("❌ error writing to local track: %s", err)
				return
			}
			// log.Printf("📦 Write Object to channel: GroupID: %v, ObjectID: %v, Payload: %v bytes", obj.GroupID, obj.ObjectID, len(obj.Payload))
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
	log.Printf("🔔 Subscription received: namespace(%s), trackName(%s), id(%v)", s.Namespace, s.TrackName, s.ID)
	switch s.Namespace {
	case "channels": //! S1: request for channel list []string from server
		channelList := channelmanager.GetChannelNames() //TODO: return channel status later
		channelListBytes, err := json.Marshal(channelList)
		if err != nil {
			log.Printf("❌ error marshalling channel list: %s", err)
			srw.Reject(uint64(moqtransport.ErrorCodeInternal), "error marshalling channel list")
			return
		}

		go writeMetaObject(sm.audience.Session, s.Namespace, s.TrackName, 0, 0, 0, channelListBytes, srw)

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

			go writeMetaObject(sm.audience.Session, s.Namespace, s.TrackName, 0, 1, 0, catalogTracksBytes, srw)

		default: //! S0: regular track subscription
			// TODO: handle media track sub change from default to other tracks
			// 1. get the channel obj with the channel name & get the audience obj from sm
			// 2. add the audience object to the channel's track audience list
			// 3. track registration
			// 4. bridge track from bridge sub to get the next new groups
			// 5. write the object to the audience from the bridge track

			// old method without bridge track ====================================
			channel, err := channelmanager.GetChannelByName(s.Namespace)
			if err != nil {
				log.Printf("❌ error getting channel: %s", err)
				srw.Reject(http.StatusNotFound, "channel not found")
				return
			}
			channel.ListAudiencesSubscribedToTracks() //! test
			addAudienceError := channel.AddAudienceToTrack(s.TrackName, sm.audience)
			if addAudienceError != nil {
				log.Printf("❌ error adding audience to track: %s", addAudienceError)
			}
			log.Printf("🔔 Audience added to track list: %s", s.TrackName)
			channel.ListAudiencesSubscribedToTracks() //! test

			track := moqtransport.NewLocalTrack(s.Namespace, s.TrackName)
			error := sm.audience.Session.AddLocalTrack(track)
			if error != nil && error.Error() != "duplicate entry" { //! ignore duplicate entry error (temporary fix)
				log.Printf("❌ error adding local track: %s", error)
				srw.Reject(http.StatusInternalServerError, "error adding local track")
				return
			}
			srw.Accept(channel.Tracks[s.TrackName])

			// new method with bridge track ====================================
			// TODO: replace bridge track sub with moqtransport similar function
			// var channel *channel.Channel
			// var track *moqtransport.LocalTrack
			// // prevent re-adding on bridgeSub
			// // TODO: manage bridgeSubId
			// if s.ID != 999 && s.ID != 1000 {
			// 	var err error
			// 	channel, err = channelmanager.GetChannelByName(s.Namespace)
			// 	if err != nil {
			// 		log.Printf("❌ error getting channel: %s", err)
			// 		srw.Reject(http.StatusNotFound, "channel not found")
			// 		return
			// 	}
			// 	channel.AddAudienceToTrack(s.TrackName, sm.audience)

			// 	track = moqtransport.NewLocalTrack(s.Namespace, s.TrackName)
			// e := sm.audience.Session.AddLocalTrack(track)
			// if e != nil {
			// 	log.Printf("❌ error adding local track: %s", e)
			// 	srw.Reject(http.StatusInternalServerError, "error adding local track")
			// 	return
			// }

			// 	log.Printf("🔔 Audience added to track: %s", s.TrackName)
			// 	log.Printf("🔔 NewLocalTrack added to channel '%s'", channel.Name)
			// }

			// // TODO: manage bridgeSubId
			// bridgeSubId := uint64(0)
			// if s.TrackName == "audio" {
			// 	bridgeSubId = 2 ^ 64 - 1
			// } else {
			// 	bridgeSubId = 2 ^ 64 - 2
			// }

			// // sub for bridge track on channel session
			// // ? why I donot need to do another srw.Accept(channel.Tracks[trackName]) here for the bridge sub (it worked without doing so)?
			// // ? No need to register this bridge sub on channel's session.
			// bridge, err := channel.Session.Subscribe(context.Background(), bridgeSubId, bridgeSubId, s.Namespace, s.TrackName, "") // subscribe to channel's track
			// if err != nil {
			// 	log.Printf("❌ error subscribing to channel's track: %s", err)
			// 	return
			// }
			// log.Printf("🔔 Bridge track subscription done: %s, subId: %v", s.TrackName, s.ID) // ? Only got s.ID = 2(audio) and 3 (hd)

			// joinPoint := false
			// joinPointGroupID := uint64(0)
			// go func(remote *moqtransport.RemoteTrack, local *moqtransport.LocalTrack) {
			// 	for {
			// 		obj, err := remote.ReadObject(context.Background())
			// 		if err != nil {
			// 			log.Printf("❌ error reading remote track object: %s", err)
			// 			return
			// 		}
			// 		if obj.ObjectID == 0 {
			// 			joinPoint = true
			// 			joinPointGroupID = obj.GroupID
			// 		}
			// 		if joinPoint && obj.GroupID >= joinPointGroupID {
			// 			if err := local.WriteObject(context.Background(), obj); err != nil {
			// 				log.Printf("❌ error writing to local track: %s", err)
			// 				return
			// 			}
			// 			log.Printf("📦 Write Object to audience on track '%s': GroupID: %v, ObjectID: %v, Payload: %v bytes", s.TrackName, obj.GroupID, obj.ObjectID, len(obj.Payload))
			// 		} else {
			// 			log.Printf("📦 Discarding objs from last group on track '%s': GroupID: %v, ObjectID: %v, Payload: %v bytes", s.TrackName, obj.GroupID, obj.ObjectID, len(obj.Payload))
			// 		}
			// 	}
			// }(bridge, track)

			// srw.Accept(track)
		}
	}
}
