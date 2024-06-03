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
	"time"

	"github.com/quic-go/quic-go"
)

func main() {
	// Initialize the QUIC server
	listener, err := quic.ListenAddr("localhost:4242", generateTLSConfig(), nil)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println("Server is listening on port 4242")

	// Accept incoming connections
	for {
		session, err := listener.Accept(context.Background())
		if err != nil {
			log.Println("Error accepting session:", err)
			continue
		}

		go handleSession(session)
	}
}

// handleSession handles a new session
func handleSession(session quic.Connection) {

	fmt.Println("New session accepted from", session.RemoteAddr())

	// remote address as the connectionID
	remoteAddr := session.RemoteAddr().String()
	fmt.Printf("Remote address: %s\n", remoteAddr)

	for {
		stream, err := session.AcceptStream(context.Background())
		if err != nil {
			log.Println("Error accepting for session: ", err)
			return
		}

		go handleStream(stream)
	}
}

// handleStream handles a new stream
func handleStream(stream quic.Stream) {
	defer stream.Close()

	buf := make([]byte, 1024)
	for {
		n, err := stream.Read(buf)
		if err != nil {
			if err == io.EOF {
				// EOF is expected when the client closes the stream
				// fmt.Println("Client closed the stream")
				return
			}
			log.Println("Error reading from stream:", err)
			return
		}

		fmt.Printf("Received message: %s\n", string(buf[:n]))

		_, err = stream.Write([]byte("Hello from QUIC server!"))
		if err != nil {
			log.Println("Error writing to stream:", err)
			return
		}
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
