# MOQ Live Stream: Low Latency Live-Streaming using Media over QUIC

The Media over QUIC (MoQ) initiative, led by the Internet Engineering Task Force (IETF), aims to revolutionize live streaming by leveraging the QUIC protocol to achieve low latency and scalable media transmission. Traditional live streaming platforms like Twitch and YouTube use protocols such as RTMP for media ingestion and adaptive streaming over HTTP for distribution, which are effective for scaling but often result in high latencies. Conversely, real-time protocols like RTP provide low latency but are challenging to scale. MoQ seeks to develop a unified protocol stack that addresses both issues by utilizing QUIC's advanced features like improved congestion control and elimination of head-of-line blocking.

This thesis aims to implement a prototype live-streaming system based on the MoQ framework, allowing media to be streamed through QUIC from a server to clients with low latency and high scalability. The system will be compared to traditional streaming architectures to demonstrate its advantages in reducing latency and improving performance. This project highlights the potential of MoQ to enhance live streaming experiences, setting a new standard for interactive media applications.

## System Architecture

<table>
  
  <th>
    <tr>
      <td>Class Diagram</td>
      <td>State Machine Diagram</td>
    </tr>
  </th>

  <tr>
    <td>
      <img width="500" src="https://github.com/TUM-Master-Thesis-MoQ/moq-live-stream/assets/33310255/b7046371-adbb-4058-8f93-4b877f42c1c6">
    </td>
    <td>
      <img width="500" src="https://github.com/TUM-Master-Thesis-MoQ/moq-live-stream/assets/33310255/f15041b2-fcf8-46f3-a3bc-7914a26dfa00">
    </td>
  </tr>
  
</table>

## Roadmap

- [x] Build a client-server app using quic-go
  - [x] Extend it to support multiple sessions/clients
  - [x] Extend it to communicate using WebTransport API
- [x] refine system architecture design
  - [x] subscription based communication [streamer, channel, subscriber, channel manager, *chat room, message (pending)*]
- [x] WebTransport web client
  - [x] implement system Architecture
    - [x] server side
      - [x] video support
      - [ ] audio support (encoding issue investigating)
      - [ ] control messages support
    - [ ] client side
      - [ ] video support
      - [ ] audio support
      - [ ] control messages support

## Setup & Run

### Prerequisites

- go: 1.22.3
- node.js: 22.4.0
- npm: 10.8.1

### TLS Certificates Setup

1. Nav to `./utilities` and run the following command to generate the certificates:
   ```sh
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout key.pem -out cert.pem -config localhost.cnf
   ```
2. Add the generated certificates to your root CA.

   \*TLS config specified in `./utilities/localhost.cnf`.

### Backend

1. Install go dependencies in root dir:
   ```sh
   go mod tidy
   ```
2. Run the server in root dir:
   ```sh
   go run ./server/main.go
   ```

### Frontend

\*Run the clients _(one client per terminal)_

- streamer
  - nav to `./client/streamer-app` then run:
    ```sh
    npm install
    npm start
    ```
- subscriber
  - nav to `./client/subscriber-app` then run:
    ```sh
    npm install
    npm start
    ```
