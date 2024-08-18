package webtransportserver

import (
	"crypto/tls"
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
	// // Register a handler for the root path
	// http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
	// 	log.Println("🪵 HTTP/3 request received")
	// 	fmt.Fprintf(w, "Hello, HTTP/3!")
	// })
	// log.Printf("🪵 HTTP/3 server running on %v \n", s.addr)

	cert, err := tls.LoadX509KeyPair("./utilities/cert.pem", "./utilities/key.pem")
	if err != nil {
		log.Fatalf("❌ error loading server certificate: %s.\nNav to utilities folder and run \n'openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout key.pem -out cert.pem -config localhost.cnf'\n to generate a certificate. \nDo not forget to trust it in your keyChain!", err)
	}
	tlsConfig := &tls.Config{Certificates: []tls.Certificate{cert}}

	// // Get the hash of the server certificate
	// certificate, err := x509.ParseCertificate(cert.Certificate[0])
	// if err != nil {
	// 	log.Fatalf("❌ error parsing server certificate: %s", err)
	// }
	// certHash := sha256.Sum256(certificate.Raw)
	// log.Printf("🔐 Server certificate hash: %x", certHash)

	wtS := webtransport.Server{
		H3: http3.Server{
			Addr:      ":443",
			TLSConfig: tlsConfig,
		},
		CheckOrigin: func(r *http.Request) bool { return true },
	}

	// webtransport endpoint for streamers
	http.HandleFunc("/webtransport/streamer", func(w http.ResponseWriter, r *http.Request) {
		session, _ := originCheckAndSessionUpgrade(&wtS, w, r)
		// log.Printf("🪵 WebTransport server listening on %v/webtransport \n", wtS.H3.Addr)

		// init with tempChannelName, will be updated when the streamer sends the ANNOUNCE(catalog-ns) message
		tempChannel := "tempChannel"
		streamer, err := channelmanager.InitStreamer(tempChannel, "")
		if err != nil {
			log.Printf("❌ error creating channel: %s", err)
		}

		sm := &sessionManager{}
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

		// Session is managed in its parent obj:
		// Audience Session in Audience obj, Channel Session in Channel obj
		// Streamer: frontend app of the streamer
		// Audience: frontend app of the audience
		// Channel: backend server of the streamer

		// // ? do we need to add this session to the session manager? or it should be a publisher session?
		// // ? or we donot need to manage it since it's a publisher session (long living session)

		// sm.addWebTransportSession(moqSession)
		// // ? this is where we will handle incoming streams(video&audio) from the streamer
		// go sm.handleMOQTSession(moqSession)
	})

	// webtransport endpoint for the audience
	// TODO: revamp on how audience should be setup on start and how to handle multiple audiences properly
	http.HandleFunc("/webtransport/audience", func(w http.ResponseWriter, r *http.Request) {
		session, _ := originCheckAndSessionUpgrade(&wtS, w, r)
		log.Printf("🪵 WebTransport server running on https://localhost:443/webtransport/audience")

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
		if err := moqSession.RunClient(); err != nil {
			log.Printf("failed to run client: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}

		audience.SetSession(moqSession)
		log.Printf("🪵 new session added to audience: %v", session)
		// // TODO: send ANNOUNCE message to the audience when it connects
		go sm.announceChannels(moqSession)
	})

	if err := wtS.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}

func originCheckAndSessionUpgrade(wtS *webtransport.Server, w http.ResponseWriter, r *http.Request) (*webtransport.Session, error) {
	origin := r.Header.Get("Origin")
	matchOrigin, _ := regexp.MatchString(`^https://localhost:`, origin)
	if origin == "" || matchOrigin || origin == "https://googlechrome.github.io" {
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
