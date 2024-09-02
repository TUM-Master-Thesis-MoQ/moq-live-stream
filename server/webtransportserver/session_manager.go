package webtransportserver

import (
	"context"
	"encoding/json"
	"moqlivestream/component/audiencemanager"
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

// TODO: remove redundant subscriptionId and trackAlias initialization (remove new func)
func newSessionManager() *sessionManager {
	return &sessionManager{0, 0}
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
	trackNameList := strings.Split(s.TrackName, "-")
	log.Printf("🔔 Subscription received: %s", s.TrackName)
	switch s.Namespace {
	// subscription under "channels" namespace
	case "channels": //! S1: request for channel list []string from server
		//! if no triggering announce, this checking should be omitted
		// if trackNameList[0] != "channelListTrack" {
		// 	srw.Reject(http.StatusConflict, "namespace is not 'channels' while trackName is 'channelListTrack'")
		// 	return
		// }

		//! this will always be the case if the second time the same audience sends a subscribe request
		// if !audiencemanager.AudienceUnique(trackNameList[1]) { // should not happen since audience name is a random 128bit hex string
		// 	srw.Reject(http.StatusConflict, "audience name already exists")
		// 	return
		// }

		audience, err := audiencemanager.GetAudienceByName("tempAudience")
		if err != nil {
			log.Printf("❌ error getting audience: %s", err)
			srw.Reject(http.StatusNotFound, "error getting audience")
			return
		}
		audience.ID = trackNameList[1]
		audience.Name = trackNameList[1]
		log.Printf("🔔 Audience info updated: id: %s, name: %s", audience.ID, audience.Name)

		// send channel list ([] string) file to the audience
		channelList := channelmanager.GetChannelNames() //TODO: return channel status later
		channelListBytes, err := json.Marshal(channelList)
		if err != nil {
			log.Printf("❌ error marshalling channel list: %s", err)
			srw.Reject(uint64(moqtransport.ErrorCodeInternal), "error marshalling channel list")
			return
		}

		writeMetaObject(audience.Session, s.Namespace, s.TrackName, 0, 0, 0, channelListBytes, srw)

	// subscription under regular channel namespace
	default:
		switch trackNameList[0] {
		case "trigger": //! S2: empty track name indicates request for ANNOUNCE with the requested channel name(namespace)
			// send ANNOUNCE msg with the requested channel name(namespace)
			audience, err := audiencemanager.GetAudienceByName(trackNameList[1])
			if err != nil {
				log.Printf("❌ error getting audience: %s", err)
				srw.Reject(http.StatusNotFound, "audience not found")
				return
			}
			log.Printf("🔔 Triggering ANNOUNCE on ns: %s with on audience %s", s.Namespace, trackNameList[1])
			srw.Accept(moqtransport.NewLocalTrack(s.Namespace, s.TrackName)) //write nothing to the track
			// writeMetaObject(audience.Session, s.Namespace, s.TrackName, 0, 1, 0, []byte("trigger"), srw)
			audience.Session.Announce(context.Background(), s.Namespace)

		case "catalogTrack": //! S3: request for catalogTracks of chosen channel(namespace)
			log.Printf("🔔 CatalogTrack request: %s", s.TrackName)
			audience, err := audiencemanager.GetAudienceByName(trackNameList[1])
			if err != nil {
				log.Printf("❌ error getting audience: %s", err)
				srw.Reject(http.StatusNotFound, "audience not found")
				return
			}
			log.Printf("🔔 Audience id: %s", audience.Name)

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

			writeMetaObject(audience.Session, s.Namespace, s.TrackName, 0, 1, 0, catalogTracksBytes, srw)

		default: //! S0: regular track subscription
			// handle as regular track subscription, currently only supports copying media stream track from channel's track to audience session(srw.Accept())
			// TODO: handle track subscription that the streamer is not streaming to the server (exp: md 720P video track).
			// 1. get the channel obj with the channel name
			// 2. get the audience obj with the audience session pointer
			// 3. add the audience object to the channel's track audience list // add the audience session to the channel's track audience list with the track name

			channel, err := channelmanager.GetChannelByName(s.Namespace)
			if err != nil {
				log.Printf("❌ error getting channel: %s", err)
				srw.Reject(http.StatusNotFound, "channel not found")
				return
			}

			audience, err := audiencemanager.GetAudienceByName(trackNameList[1])
			if err != nil {
				log.Printf("❌ error getting audience: %s", err)
				srw.Reject(http.StatusNotFound, "audience not found")
				return
			}
			log.Printf("🔔 Audience id: %s", audience.Name)

			channel.AddAudienceToTrack(trackNameList[0], audience)

			srw.Accept(channel.Track)
		}
	}
}
