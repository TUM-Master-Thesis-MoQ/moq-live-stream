package webtransportserver

import (
	"errors"
	"moqlivestream/utilities"
	"net/http"
	"regexp"

	"moqlivestream/component/audience"
	"moqlivestream/component/channelmanager"

	"github.com/mengelbart/moqtransport"
	"github.com/mengelbart/moqtransport/webtransportmoq"
	"github.com/quic-go/quic-go/http3"
	"github.com/quic-go/webtransport-go"
)

var log = utilities.NewCustomLogger()

func StartServer() {

	wtS := webtransport.Server{
		H3: http3.Server{
			Addr:      ":443",
			TLSConfig: utilities.LoadTLSConfig(),
		},
		CheckOrigin: func(r *http.Request) bool { return true },
	}

	// webtransport endpoint for streamers
	http.HandleFunc("/webtransport/streamer", func(w http.ResponseWriter, r *http.Request) {
		session, err := originCheckAndSessionUpgrade(&wtS, w, r)
		if err != nil {
			log.Printf("❌ error upgrading session: %s", err)
			return
		}
		log.Println("🪵 WebTransport streamer server running on https://localhost:443/webtransport/streamer")

		// init with tempChannelName, will be updated when the streamer sends the ANNOUNCE(catalog-ns) message
		tempChannel := "tempChannel"
		streamer, err := channelmanager.InitStreamer(tempChannel, "")
		if err != nil {
			log.Printf("❌ error creating channel: %s", err)
		}
		log.Printf("🆕 Streamer channel created: %s", streamer.Channel.Name)

		sm := &sessionManager{0, 0}
		moqSession := &moqtransport.Session{
			Conn:                webtransportmoq.New(session),
			EnableDatagrams:     false,
			LocalRole:           moqtransport.RoleSubscriber,
			RemoteRole:          moqtransport.RolePublisher,
			AnnouncementHandler: sm,
			SubscriptionHandler: nil,
		}
		if err := moqSession.RunServer(r.Context()); err != nil {
			log.Printf("failed to run server: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		streamer.Channel.SetSession(moqSession)
		log.Println("🪵 streamer moqt session initialized")
	})

	// webtransport endpoint for the audience
	// // TODO: revamp on how audience should be setup on start and how to handle multiple audiences properly
	http.HandleFunc("/webtransport/audience", func(w http.ResponseWriter, r *http.Request) {
		session, err := originCheckAndSessionUpgrade(&wtS, w, r)
		if err != nil {
			log.Printf("❌ error upgrading session: %s", err)
			return
		}
		log.Println("🪵 WebTransport audience server running on https://localhost:443/webtransport/audience")

		audience := audience.NewAudience("wt audience")
		log.Print("🆕 Audience: ", audience.ID, audience.Name)

		sm := &sessionManager{0, 0}
		moqSession := &moqtransport.Session{
			Conn:                webtransportmoq.New(session),
			EnableDatagrams:     false,
			LocalRole:           moqtransport.RolePublisher,
			RemoteRole:          moqtransport.RoleSubscriber,
			AnnouncementHandler: nil,
			SubscriptionHandler: sm,
		}
		if err := moqSession.RunServer(r.Context()); err != nil {
			log.Printf("failed to run audience server: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		} else {
			log.Printf("🪵 moqt audience client running...")
		}

		audience.SetSession(moqSession)
		log.Printf("🪵 new session added to audience: %v", session)
		// // TODO: send ANNOUNCE message to the audience when it connects
		go sm.announceChannels(r.Context(), moqSession)
	})

	if err := wtS.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}

func originCheckAndSessionUpgrade(wtS *webtransport.Server, w http.ResponseWriter, r *http.Request) (*webtransport.Session, error) {
	origin := r.Header.Get("Origin")
	matchOrigin, _ := regexp.MatchString(`^https://localhost:`, origin)
	if origin == "" || matchOrigin {
		// log.Printf("✅ Origin allowed: %s", origin)
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
		w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")
		w.WriteHeader(http.StatusOK)
	} else {
		log.Printf("❌ Origin not allowed: %s", origin)
		http.Error(w, "Origin not allowed", http.StatusForbidden)
		return nil, errors.New("origin not allowed")
	}

	session, err := wtS.Upgrade(w, r)
	if err != nil {
		log.Printf("❌ wts upgrading failed: %s", err)
		return nil, errors.New("wts upgrading failed")
	}

	return session, nil
}
