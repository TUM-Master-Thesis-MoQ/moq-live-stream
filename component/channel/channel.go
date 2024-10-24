package channel

import (
	"errors"
	"moqlivestream/component/audience"
	"moqlivestream/component/channel/catalog"
	"sync"

	"github.com/google/uuid"
	"github.com/mengelbart/moqtransport"
)

type TrackAudiences struct {
	TrackName string
	Audiences []*audience.Audience
}

func NewTracksAudiences() []*TrackAudiences {
	return []*TrackAudiences{}
}

type Channel struct {
	ID              uuid.UUID
	Name            string
	Status          bool
	Session         *moqtransport.Session
	Catalog         *catalog.Catalog
	Audiences       []*audience.Audience                // list of Audience connected to the channel
	Tracks          map[string]*moqtransport.LocalTrack // map of trackName and Track kvp
	TracksAudiences []*TrackAudiences                   // list of Audience subscribed to a specific track
	// Subscribers     map[uuid.UUID]string
	// ChatRoom map[uuid.UUID]*chatroom.ChatRoom
	Mutex sync.Mutex
}

func NewChannel() *Channel {
	id := uuid.New()
	return &Channel{
		ID:              id,
		Name:            id.String(),
		Status:          false,
		Session:         nil, // empty on init, updated when session established
		Catalog:         nil, // empty on init, updated when catalog is received
		Audiences:       []*audience.Audience{},
		Tracks:          make(map[string]*moqtransport.LocalTrack),
		TracksAudiences: NewTracksAudiences(),
		// Subscribers:     make(map[uuid.UUID]string),
		// ChatRoom: nil,
		Mutex: sync.Mutex{},
	}
}

// set channel session
func (ch *Channel) SetSession(session *moqtransport.Session) error {
	if session == nil {
		return errors.New("session is nil")
	}
	if ch == nil {
		return errors.New("channel is nil")
	}

	ch.Session = session
	ch.Status = true
	return nil
}

// remove channel session
func (ch *Channel) RemoveSession() error {
	if ch == nil {
		return errors.New("channel is nil")
	}

	ch.Session = nil
	ch.Status = false
	return nil
}

// set channel catalog
func (ch *Channel) SetCatalog(catalog *catalog.Catalog) error {
	if catalog == nil {
		return errors.New("catalog is nil")
	}
	if ch == nil {
		return errors.New("channel is nil")
	}

	ch.Catalog = catalog
	return nil
}

// remove channel catalog
func (ch *Channel) RemoveCatalog() error {
	if ch == nil {
		return errors.New("channel is nil")
	}

	ch.Catalog = nil
	return nil
}

// add audience to the channel
func (ch *Channel) AddAudience(au *audience.Audience) error {
	ch.Mutex.Lock()
	defer ch.Mutex.Unlock()

	for _, aud := range ch.Audiences {
		if aud.ID == au.ID {
			return errors.New("audience already in the channel")
		}
	}
	ch.Audiences = append(ch.Audiences, au)
	return nil
}

// remove audience from the channel
func (ch *Channel) RemoveAudience(au *audience.Audience) error {
	ch.Mutex.Lock()
	defer ch.Mutex.Unlock()

	for i, aud := range ch.Audiences {
		if aud.ID == au.ID {
			ch.Audiences = append(ch.Audiences[:i], ch.Audiences[i+1:]...)
			return nil
		}
	}
	return errors.New("audience not in the channel")
}

// get audience by its session
func (ch *Channel) GetAudienceBySession(session *moqtransport.Session) (*audience.Audience, error) {
	ch.Mutex.Lock()
	defer ch.Mutex.Unlock()

	for _, aud := range ch.Audiences {
		if aud.Session == session {
			return aud, nil
		}
	}
	return nil, errors.New("audience not found")
}

// add a Subscriber to the Channel's TrackAudiences list by trackName
func (ch *Channel) AddAudienceToTrack(trackName string, au *audience.Audience) error {
	if len(au.ID.String()) != 36 { // 32 for uuid, 36 for uuid with hyphen
		return errors.New("audience ID not valid")
	}
	if ch == nil {
		return errors.New("channel is nil")
	}

	ch.Mutex.Lock()
	defer ch.Mutex.Unlock()

	trackExist := false
	for _, track := range ch.TracksAudiences {
		if trackName == track.TrackName {
			for _, aud := range track.Audiences {
				if aud.ID == au.ID {
					return errors.New("audience already subscribed to the track")
				}
			}
			track.Audiences = append(track.Audiences, au)
			trackExist = true
			return nil
		}
	}
	if !trackExist {
		trackAudiences := &TrackAudiences{
			TrackName: trackName,
			Audiences: []*audience.Audience{au},
		}
		ch.TracksAudiences = append(ch.TracksAudiences, trackAudiences)
	}

	return nil
}

// remove a Subscriber from the track of the Channel's TrackAudiences list
func (ch *Channel) RemoveAudienceFromTrack(trackName string, au *audience.Audience) error {
	if len(au.ID) != 32 {
		return errors.New("audience ID not valid")
	}
	if ch == nil {
		return errors.New("channel is nil")
	}

	ch.Mutex.Lock()
	defer ch.Mutex.Unlock()

	subscriberExist := false
	for _, track := range ch.TracksAudiences {
		if trackName == track.TrackName {
			for i, aud := range track.Audiences {
				if aud.ID == au.ID {
					track.Audiences = append(track.Audiences[:i], track.Audiences[i+1:]...)
					subscriberExist = true
					return nil
				}
			}
		}
	}
	if !subscriberExist {
		return errors.New("subscriber not subscribed to the track specified")
	}

	return nil
}

/*change the resolution of a streaming Channel the Subscriber is watching (subscription not required)
 * //TODO: implement resolution change
 */
func (ch *Channel) ChangeResolution(id uuid.UUID, res string) error {
	if id == uuid.Nil {
		return errors.New("subscriber ID is nil")
	}
	if ch == nil {
		return errors.New("channel is nil")
	}

	ch.Mutex.Lock()
	defer ch.Mutex.Unlock()

	// if _, ok := ch.TrackAudiences.Audiences[id]; !ok {
	// 	return errors.New("subscriber not joined the streaming channel")
	// }

	return nil
}

/*send a message to the Channel's ChatRoom (subscription required)
 * // TODO: implement SendMessage
 */
func (ch *Channel) SendMessage(id uuid.UUID, msg string) error {
	if id == uuid.Nil {
		return errors.New("subscriber ID is nil")
	}
	if ch == nil {
		return errors.New("channel is nil")
	}

	ch.Mutex.Lock()
	defer ch.Mutex.Unlock()

	// if _, ok := ch.Subscribers[id]; !ok {
	// 	return errors.New("subscriber not subscribed to channel")
	// }

	return nil
}

// // add a Subscriber to the Channel's Subscribers list,require Subscriber's ID and Name
// func (ch *Channel) AddSubscriber(id uuid.UUID, name string) error {
// 	if ch == nil {
// 		return errors.New("channel is nil")
// 	}

// 	ch.Mutex.Lock()
// 	defer ch.Mutex.Unlock()

// 	if _, ok := ch.Subscribers[id]; ok {
// 		return errors.New("subscriber already subscribed to channel")
// 	}

// 	ch.Subscribers[id] = name
// 	return nil
// }

// // remove a Subscriber from the Channel's Subscribers list, require Subscriber's ID
// func (ch *Channel) RemoveSubscriber(id uuid.UUID) error {
// 	if id == uuid.Nil {
// 		return errors.New("subscriber ID is nil")
// 	}
// 	if ch == nil {
// 		return errors.New("channel is nil")
// 	}

// 	ch.Mutex.Lock()
// 	defer ch.Mutex.Unlock()

// 	if _, ok := ch.Subscribers[id]; !ok {
// 		return errors.New("subscriber not subscribed to channel")
// 	}

// 	delete(ch.Subscribers, id)
// 	return nil
// }
