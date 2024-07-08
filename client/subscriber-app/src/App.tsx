import { useState } from "react";

function App() {
  const [messages, setMessages] = useState<string[]>([]);
  const [connected, setConnected] = useState<boolean>(false);
  const [transport, setTransport] = useState<WebTransport | null>(null);

  async function connectWTS() {
    try {
      const transport = new WebTransport("https://localhost:443/webtransport");
      await transport.ready;
      console.log("🔗 Connected to WebTransport server!");

      setMessages([]);
      setConnected(true);
      setTransport(transport);

      readStream(transport);
      writeStream(transport);
    } catch (error) {
      console.error("❌ Failed to connect:", error);
    }
  }

  async function readStream(transport: WebTransport) {
    const bds = transport.incomingBidirectionalStreams;
    const reader = bds.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log("🛑 Stream is done!");
        break;
      }
      await readData(value.readable);
    }

    async function readData(readable: ReadableStream<Uint8Array>) {
      const reader = readable.getReader();
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        const newMessage = new TextDecoder().decode(value);
        setMessages((prev) => [...prev, newMessage]);
        console.log("📩 Received rs:", newMessage);
      }
    }
  }

  async function writeStream(transport: WebTransport) {
    const { readable, writable } = await transport.createBidirectionalStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // Generate message stream
    setInterval(() => {
      const message = "Hello from WebTransport client!";
      writer.write(encoder.encode(message));
      console.log("📤 Sent:", message);
    }, 1000);

    // read res from the same bidirectional stream
    const reader = readable.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      const newMessage = new TextDecoder().decode(value);
      console.log("📩 Received rs from bds:", newMessage);
    }
  }

  async function disconnectWTS() {
    if (transport && connected) {
      // TODO: formally close the transport?
      try {
        await transport.close();
        console.log("🔌 Disconnected from WebTransport server!");
      } catch (error) {
        console.error("❌ Failed to disconnect:", error);
      } finally {
        setMessages([]);
        setConnected(false);
        setTransport(null);
      }
    }
  }
  return (
    <div>
      <div className="text-center">
        {!connected ? (
          <button
            className="bg-blue-500 font-bold text-center my-1 p-1 rounded-md text-white"
            onClick={connectWTS}
          >
            Connect
          </button>
        ) : (
          <div>
            <span className="font-bold text-center my-1 p-1 rounded-md text-green-500">
              Connected to WebTransport server!
            </span>
            <button
              className="bg-red-500 font-bold text-center my-1 p-1 rounded-md text-white"
              onClick={disconnectWTS}
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
      <div className="text-3xl font-bold underline text-center my-2">
        Received Message from WebTransport Session streams:
      </div>

      <div className="grid grid-cols-3 text-center font-bold gap-1">
        {messages.map((message, index) => (
          <div>
            <div
              key={index}
              className="bg-purple-300 border-spacing-1 rounded-md inline-block"
            >
              {message}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
