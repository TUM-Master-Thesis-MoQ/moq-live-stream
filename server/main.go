package main

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"io"
	"log"
	"math/big"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/quic-go/quic-go"
)

type quicConnection struct {
	quicConnections map[string]quic.Connection
	reverseIndex    map[quic.Connection]string
	mutex           sync.Mutex
}

func newConnection() *quicConnection {
	return &quicConnection{
		quicConnections: make(map[string]quic.Connection),
		reverseIndex:    make(map[quic.Connection]string),
	}
}

// addSession adds a new session to the connection map
func (c *quicConnection) addSession(conn quic.Connection) {
	c.mutex.Lock()
	defer c.mutex.Unlock()
	qsID := uuid.New().String()
	c.quicConnections[qsID] = conn
	c.reverseIndex[conn] = qsID
}

// removeSession removes a session from the connection map
func (c *quicConnection) removeSession(conn quic.Connection) {
	c.mutex.Lock()
	defer c.mutex.Unlock()

	qsID, exists := c.reverseIndex[conn]
	if !exists {
		return
	}

	delete(c.quicConnections, qsID)
	delete(c.reverseIndex, conn)
}

func (c *quicConnection) handleSession(conn quic.Connection) {
	defer c.removeSession(conn)
	fmt.Println("new quic connection started, uuid: ", c.reverseIndex[conn])

	for {
		stream, err := conn.AcceptStream(context.Background())
		if err != nil {
			log.Printf("Error accepting stream from %s: %v\n", c.reverseIndex[conn], err)
			return
		}

		go c.handleQuicStream(stream)
	}
}

func (c *quicConnection) handleQuicStream(stream quic.Stream) {
	defer stream.Close()
	buf := make([]byte, 1024)
	for {
		n, err := stream.Read(buf)
		if err != nil {
			if err == io.EOF {
				// EOF is expected when the client closes the stream
				log.Println(" [Stream closed by client]")
				return
			}
			log.Printf(" [Error reading from stream of session: %v]", err)
			return
		}

		fmt.Printf("[msg]: %s", string(buf[:n]))

		_, err = stream.Write([]byte("Message sent!✅"))
		if err != nil {
			log.Printf("Error writing to stream of session: %v", err)
			return
		}

	}
}

func main() {
	// Initialize the QUIC server
	listener, err := quic.ListenAddr("localhost:4242", generateTLSConfig(), nil)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println("Server is listening on port 4242")

	// Accept incoming connections
	connMgr := newConnection()
	for {
		conn, err := listener.Accept(context.Background())
		if err != nil {
			log.Println("Error accepting session:", err)
			continue
		}
		connMgr.addSession(conn)
		go connMgr.handleSession(conn)
	}
}

func generateTLSConfig() *tls.Config {
	key, cert := generateKeyAndCert()
	certPem, keyPem := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: cert.Raw}), pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)})

	tlsCert, err := tls.X509KeyPair(certPem, keyPem)
	if err != nil {
		log.Fatal(err)
	}

	return &tls.Config{
		Certificates: []tls.Certificate{tlsCert},
		NextProtos:   []string{"quic-echo-example"},
	}
}

func generateKeyAndCert() (*rsa.PrivateKey, *x509.Certificate) {
	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		log.Fatal(err)
	}

	template := x509.Certificate{
		SerialNumber:          big.NewInt(1),
		NotBefore:             time.Now(),
		NotAfter:              time.Now().Add(365 * 24 * time.Hour),
		KeyUsage:              x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
	}

	certBytes, err := x509.CreateCertificate(rand.Reader, &template, &template, &priv.PublicKey, priv)
	if err != nil {
		log.Fatal(err)
	}

	return priv, &x509.Certificate{Raw: certBytes}
}
