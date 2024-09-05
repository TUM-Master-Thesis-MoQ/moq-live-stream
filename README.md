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
      <img width="500" src="https://github.com/user-attachments/assets/e8ef92f3-575d-4b83-8749-04b4dc798512">
    </td>
    <td>
      <img width="500" src="https://github.com/user-attachments/assets/6f148cd6-dee1-4b36-a237-aa2300644c0a">
    </td>
  </tr>

  <tr>
    <td>
      <details>
        <summary>Version History</summary>
        <table>
          <tr>
            <td>
              <img width="500" src="https://github.com/user-attachments/assets/f373b95a-dc1a-434d-9fd4-c75817a14e87"/>
            </td>
          </tr>
          <tr>
            <td>
              <img width="500" src="https://github.com/user-attachments/assets/80f2845b-fb36-4041-a446-fd5960dd7e6a"/>
            </td>
          </tr>
          <tr>
            <td>
              <img width="500" src="https://github.com/user-attachments/assets/94ad26d3-fb4d-4016-9247-12ae484c80bb"/>
            </td>
          </tr>
          <tr>
            <td>
              <img width="500" src="https://github.com/user-attachments/assets/a1553e78-808f-4d91-b2e3-ebcef4188c95"/>
            </td>
          </tr>
          <tr>
            <td>
              <img width="500" src="https://github.com/user-attachments/assets/1d683f32-98c6-4147-887d-cd4ff84dac41"/>
            </td>
          </tr>
          <tr>
            <td>
              <img width="500" src="https://github.com/user-attachments/assets/87b76cf9-b5c9-4e0d-9254-0bac5d46607e"/>
            </td>
          </tr>
        </table>
      </details>
    </td>
    <td>
      <details>
        <summary>Version History</summary>
        <table>
          <tr>
            <td>
              <img width="500" src="https://github.com/user-attachments/assets/08d8abfe-b27c-45e8-9ce2-e6269ec1d361"/>
            </td>
          </tr>
          <tr>
            <td>
              <img width="500" src="https://github.com/user-attachments/assets/583fdc66-a9f3-458f-bbab-8ef2a843a063"/>
            </td>
          </tr>
        </table>
      </details>
    </td>
  </tr>
  
</table>

## Roadmap

- [x] Build a client-server app using quic-go
  - [x] Extend it to support multiple sessions/clients
  - [x] Extend it to communicate using WebTransport API
- [x] refine system architecture design
  - [x] subscription-based communication [streamer, channel, subscriber, channel manager, *chat room, message (pending)*]
- [x] WebTransport streaming
  - [x] server side
    - [x] video support
    - [x] audio support
  - [x] client side
    - [x] video support
    - [x] audio support
- [x] MOQT adaptation streaming
  - [x] control messages support
    - [x] server-side
      - [x] server-side
    - [x] client-side
      - [x] streamer-app
      - [x] audience-app
  - [x] obj message support
    - [x] streamer-app sending
    - [x] server-side forwarding
    - [x] audience-app receiving

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

### Server Setup

1. Install go dependencies in root dir:

   ```sh
   go mod tidy
   ```

2. Run the server in root dir:

   ```sh
   go run ./server/main.go
   ```

### Clients Setup

- Init & update submodule in root dir:

  ```sh
  git submodule update --init
  ```

- Run `streamer`: nav to `./client/streamer-app` then run:

  ```sh
  npm install
  npm start
  ```

- Run `audience`: nav to `./client/audience-app` then run:

  ```sh
  npm install
  npm start
  ```
