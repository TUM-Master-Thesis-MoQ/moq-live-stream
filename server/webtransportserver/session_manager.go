package webtransportserver

import (
	"context"
	"io"
	"sync"

	"github.com/google/uuid"
	"github.com/mengelbart/moqtransport"
)

// A sessionManager manages the moqt sessions of the audiences
type sessionManager struct {
	sessions     map[uuid.UUID]*moqtransport.Session
	reverseIndex map[*moqtransport.Session]uuid.UUID
	mutex        sync.Mutex
}

func newSessionManager() *sessionManager {
	return &sessionManager{
		sessions:     map[uuid.UUID]*moqtransport.Session{},
		reverseIndex: map[*moqtransport.Session]uuid.UUID{},
		mutex:        sync.Mutex{},
	}
}

// add a WebTransport session to the session map
func (sm *sessionManager) addWebTransportSession(session *moqtransport.Session) {
	sm.mutex.Lock()
	defer sm.mutex.Unlock()

	wtsID := uuid.New()
	sm.sessions[wtsID] = session
	sm.reverseIndex[session] = wtsID
}

// remove a WebTransport session from the session map
func (sm *sessionManager) removeWebTransportSession(session *moqtransport.Session) {
	sm.mutex.Lock()
	defer sm.mutex.Unlock()

	wtsID, exists := sm.reverseIndex[session]
	if !exists {
		return
	}

	delete(sm.sessions, wtsID)
	delete(sm.reverseIndex, session)
}

// handle a moqt session data streams only, controlStream handled by respective msg handlers
func (sm *sessionManager) handleMoqtransportSession(s *moqtransport.Session) {
	defer sm.removeWebTransportSession(s)
	log.Printf("🪵 New moqt session started, client uuid: %s\n\n", sm.reverseIndex[s])

	// ! deprecated: controlStream is not available in the session object, but handled by respective msg handlers
	// // cs := s.controlStream // ? need to access controlStream to handler, then no need to AcceptStream
	// // accept client initiated control stream
	// go func() {
	// 	for {
	// 		stream, err := s.Conn.AcceptStream(context.Background())
	// 		if err != nil {
	// 			log.Printf("❌ error accepting wt control stream from %s: %s\n", sm.reverseIndex[s], err)
	// 			return
	// 		}
	// 		go sm.handleControlStream(s, stream)
	// 	}
	// }()

	// accept streams concurrently within the same session
	// ? replace with session.acceptUnidirectionalStreams()?
	go func() {
		for {
			stream, err := s.Conn.AcceptUniStream(context.Background())
			if err != nil {
				log.Printf("❌ error accepting wt data stream from %s: %s\n", sm.reverseIndex[s], err)
				return
			}
			go sm.handleDataStream(stream, s)
		}
	}()
}

// ! deprecated: controlStream is not available in the session object, but handled by respective msg handlers
// // read control messages from the streamer
// func (sm *sessionManager) handleControlStream(s *moqtransport.Session, stream moqtransport.Stream) {
// 	// TODO: read message header to determine the message type, then handle the message accordingly
// 	s.controlStream.parseMessage(stream)
// 	pass it to the session.handleAnnounceMessage(), but before that, we need to have a Session object defined by MOQT.
// 	? but when dealing with Message , i need to access the control stream on that session, to parse the message to determine it’s type and response accordingly. How could i do it without being able to add a placeholder for controlStream (and other local fields too)?
// 	msg, err := stream.
// 	catalogJSONBytes := stream.Read(context.Background())
// 	if catalogJSONBytes != nil {
// 		log.Printf("📚 Catalog received: %s", string(catalogJSONBytes))
// 	}
// }

func (sm *sessionManager) HandleAnnouncement(s *moqtransport.Session, a *moqtransport.Announcement, arw moqtransport.AnnouncementResponseWriter) {
	// TODO: accept announcement from the streamer-app, broadcast the announcement to all audiences
	ns := a.Namespace()
	ctx := context.Context(context.Background())
	// parameters := a.parameters()
	log.Printf("📢 Announce namespace: %s", ns)
	arw.Accept() //? write response to responseCh? //? when should i reject?
	log.Printf("📢 Announce parameters:")
	// TODO: save the announce payload (catalog file)
	// TODO: announce to all audiences
	// streamerGlobal
	for _, s := range sm.sessions {
		s.Announce(ctx, ns)
	}
}

func (sm *sessionManager) HandleSubscription(s *moqtransport.Session, sub *moqtransport.Subscription, srw moqtransport.SubscriptionResponseWriter) {
	// TODO: handle subscription
	ns := sub.Namespace
	log.Printf("🔔 Subscribe namespace: %s", ns)
	// accept the subscription by default //? when should i reject?
	// TODO: LocalTrack?
	// srw.Accept()
}

func (sm *sessionManager) handleDataStream(stream moqtransport.ReceiveStream, s *moqtransport.Session) {
	var dataBuffer []byte
	buffer := make([]byte, 1024) // temp buffer to read stream data
	for {
		n, err := stream.Read(buffer)
		if err != nil && err != io.EOF {
			return
		}
		if n == 0 {
			break
		}
		dataBuffer = append(dataBuffer, buffer[:n]...)
	}
	typeBuffer := dataBuffer[:5]
	streamType := string(typeBuffer)
	trackName := "hd" // TODO: determine track name
	sm.forwardStream(dataBuffer, streamType, trackName)
	// log.Printf("🪵 Received %d bytes", len(dataBuffer))
}

// forward streams to audiences that subscribed to the same track in the channel
// TODO: forward stream by track name
func (sm *sessionManager) forwardStream(data []byte, streamType string, trackName string) {
	streamer, exists := streamerGlobal[true]
	if !exists {
		log.Printf("❌ streamer not online")
	} else if len(streamer.Channel.TracksAudiences) != 0 {
		for _, audience := range streamer.Channel.TracksAudiences {
			if audience.TrackName == trackName {
				for _, au := range audience.Audiences {
					session := au.Session
					go func(session *moqtransport.Session) {
						stream, err := session.Conn.OpenUniStream()
						if err != nil {
							log.Printf("❌ error opening stream: %s\n", err)
							return
						} else {
							_, err = stream.Write(data)
							if err != nil {
								log.Printf("❌ error writing to stream: %s\n", err)
								// return // tolerate stream writing failure / stream loss
							}
						}
						log.Printf("🪵 Forwarding %v %d bytes", streamType, len(data))
						defer stream.Close()
					}(session)
				}
				break
			}
		}
	}
}
