package channel

import (
	"errors"
	"fmt"
	"moqlivestream/component/audience"
	"moqlivestream/component/channel/catalog"
	"moqlivestream/utilities"
	"sync"

	"github.com/google/uuid"
	"github.com/mengelbart/moqtransport"
)

var log = utilities.NewCustomLogger()

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
	Audiences       []*audience.Audience // list of Audience connected to the channel
	TracksAudiences []*TrackAudiences    // list of Audience subscribed to a specific track
	AudienceCh      chan *TrackAudiences // pass TrackAudiences changes
	Mutex           sync.Mutex
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
		TracksAudiences: NewTracksAudiences(),
		AudienceCh:      make(chan *TrackAudiences),
		Mutex:           sync.Mutex{},
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

	//! fallback method to remove audience from previous subscribed track. MOQT should remove audience's localTrack from its session?
	// remove audience from all other track(s) (should be only one track if exists) if subscribed previously
	if len(ch.TracksAudiences) != 0 {
		for _, track := range ch.TracksAudiences {
			if trackName != track.TrackName && track.TrackName != "audio" { // filter out audio track
				err := ch.RemoveAudienceFromTrack(track.TrackName, au)
				if err != nil {
					log.Print(err)
				}
			}
		}
	}

	trackExist := false
	for _, track := range ch.TracksAudiences {
		if trackName == track.TrackName {
			for _, aud := range track.Audiences {
				if aud.ID == au.ID {
					return errors.New("audience already subscribed to the track")
				}
			}
			track.Audiences = append(track.Audiences, au)
			ch.AudienceCh <- track
			trackExist = true
			return nil
		}
	}
	// if track not exist, create a new track with the first audience on it
	if !trackExist {
		trackAudiences := &TrackAudiences{
			TrackName: trackName,
			Audiences: []*audience.Audience{au},
		}
		ch.TracksAudiences = append(ch.TracksAudiences, trackAudiences)
		ch.AudienceCh <- trackAudiences
	}

	return nil
}

// remove a Subscriber from the track of the Channel's TrackAudiences list
func (ch *Channel) RemoveAudienceFromTrack(trackName string, au *audience.Audience) error {
	if len(au.ID.String()) != 36 { // 32 for uuid, 36 for uuid with hyphen
		return errors.New("audience ID not valid")
	}
	if ch == nil {
		return errors.New("channel is nil")
	}

	for _, track := range ch.TracksAudiences {
		if trackName == track.TrackName {
			for i, aud := range track.Audiences {
				if aud.ID == au.ID {
					track.Audiences = append(track.Audiences[:i], track.Audiences[i+1:]...)
					ch.AudienceCh <- track
					log.Printf("audience(%s) removed from track %s", au.ID, trackName)
					return nil
				}
			}
			return fmt.Errorf("audience(%s) not subscribed to the track %s", au.ID, trackName)
		}
	}

	return fmt.Errorf("track %s not found", trackName)
}

// get the track name the audience is subscribed to
func (ch *Channel) GetTrackNameByAudience(au *audience.Audience) (string, error) {
	if len(au.ID.String()) != 36 { // 32 for uuid, 36 for uuid with hyphen
		return "", errors.New("audience ID not valid")
	}
	if ch == nil {
		return "", errors.New("channel is nil")
	}

	for _, track := range ch.TracksAudiences {
		if track.TrackName == "audio" { // filter out audio track
			continue
		}
		for _, aud := range track.Audiences {
			if aud.ID == au.ID {
				return track.TrackName, nil
			}
		}
	}
	return "", errors.New("audience not subscribed to any track")
}

// ! test: list all audiences subscribed to tracks
func (ch *Channel) ListAudiencesSubscribedToTracks() {
	ch.Mutex.Lock()
	defer ch.Mutex.Unlock()

	for _, track := range ch.TracksAudiences {
		audienceIDs := ""
		for _, aud := range track.Audiences {
			audienceIDs += aud.ID.String() + ", "
		}
		// Remove the trailing comma and space
		if len(audienceIDs) > 0 {
			audienceIDs = audienceIDs[:len(audienceIDs)-2]
		}
		log.Printf("%s: %s", track.TrackName, audienceIDs)
	}
}
