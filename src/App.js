import React, { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref as dbRef, set } from "firebase/database";
import "./App.css"; // Make sure this is in the same folder

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBVqWHT2UF1V9pEIN9lXRIJg6xYup054iE",
  authDomain: "tamu-hi.firebaseapp.com",
  databaseURL: "https://tamu-hi-default-rtdb.firebaseio.com",
  projectId: "tamu-hi",
  storageBucket: "tamu-hi.firebasestorage.app",
  messagingSenderId: "687776576314",
  appId: "1:687776576314:web:686a55c706f80b7b381603",
};

initializeApp(firebaseConfig);
const db = getDatabase();

const App = () => {
  // Splash screen
  const [showSplash, setShowSplash] = useState(true);

  // Transcript & Speech
  const [speechText, setSpeechText] = useState("");
  const [listening, setListening] = useState(false);
  const finalTranscriptRef = useRef("");
  const recognitionRef = useRef(null);

  // Extended hand sign presets
  const handSigns = {
    peace:      { thumb: "close", index: "open",  middle: "open",  ring: "close", pinky: "close" },
    rock:       { thumb: "close", index: "close", middle: "close", ring: "open",  pinky: "open" },
    thumbsUp:   { thumb: "open",  index: "close", middle: "close", ring: "close", pinky: "close" },
    highFive:   { thumb: "open",  index: "open",  middle: "open",  ring: "open",  pinky: "open" },
    fist:       { thumb: "close", index: "close", middle: "close", ring: "close", pinky: "close" },
    flipoff:    { thumb: "close", index: "close", middle: "open",  ring: "close", pinky: "close" },
    pinkyswear: { thumb: "close", index: "close", middle: "close", ring: "close", pinky: "open" },
    pointing:   { thumb: "close", index: "open",  middle: "close", ring: "close", pinky: "close" },
    callme:     { thumb: "open",  index: "close", middle: "close", ring: "close", pinky: "open" },
  };

  // ========== Firebase Update Helpers ==========
  const updateFingerCommand = (finger, action) => {
    set(dbRef(db, `handCommands/${finger}`), action);
    console.log(`Updated ${finger} to ${action}`);
  };

  const updateHandCommand = (action) => {
    ["thumb", "index", "middle", "ring", "pinky"].forEach((finger) =>
      updateFingerCommand(finger, action)
    );
  };

  const applyHandSign = (sign) => {
    const signConfig = handSigns[sign];
    if (!signConfig) {
      console.log("No hand sign config found for:", sign);
      return;
    }
    Object.entries(signConfig).forEach(([finger, action]) => {
      updateFingerCommand(finger, action);
    });
  };

  // ========== Parsing Logic ==========
  const parseNewText = (text) => {
    const lower = text.toLowerCase();
    let searchIndex = 0;
    while (true) {
      const idx = lower.indexOf("high five", searchIndex);
      if (idx === -1) break;
      searchIndex = idx + 9; // move past "high five"
      let commandPart = lower.slice(idx + 9).trim();
      commandPart = commandPart.replace(/[^a-z0-9 ]/gi, "").trim();
      console.log("Parsed command part:", commandPart);
      handleParsedCommand(commandPart);
    }
  };

  // Interprets a single command substring after "high five"
  const handleParsedCommand = (cmd) => {
    // 1) Check if cmd matches a sign (like "thumbs up") by normalizing
    const normalizedCmd = cmd.replace(/\s+/g, "").toLowerCase();
    const signKey = Object.keys(handSigns).find((key) => {
      const normalizedKey = key.replace(/\s+/g, "").toLowerCase();
      return normalizedKey === normalizedCmd;
    });
    if (signKey) {
      applyHandSign(signKey);
      return;
    }

    // 2) Check for open/close hand
    if (cmd.startsWith("open hand") || cmd.startsWith("open the hand")) {
      updateHandCommand("open");
      return;
    }
    if (cmd.startsWith("close hand") || cmd.startsWith("close the hand")) {
      updateHandCommand("close");
      return;
    }

    // 3) Single-finger commands
    let openOrClose = null;
    let finger = null;

    if (cmd.startsWith("open")) {
      openOrClose = "open";
      finger = cmd.replace("open", "").trim();
    } else if (cmd.startsWith("close")) {
      openOrClose = "close";
      finger = cmd.replace("close", "").trim();
    }

    // synonyms
    if (finger === "pointer") finger = "index";
    if (finger === "middle finger") finger = "middle";
    if (finger === "index finger") finger = "index";
    if (finger === "ring finger") finger = "ring";
    if (finger === "pinky finger") finger = "pinky";

    const validFingers = ["thumb", "index", "middle", "ring", "pinky"];
    if (openOrClose && validFingers.includes(finger)) {
      updateFingerCommand(finger, openOrClose);
    } else {
      console.log("Unknown command:", cmd);
    }
  };

  // ========== Speech Recognition Flow ==========
  const startListening = () => {
    if (!("SpeechRecognition" in window || "webkitSpeechRecognition" in window)) {
      console.error("SpeechRecognition not supported in this browser.");
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognitionRef.current = new SR();
    recognitionRef.current.lang = "en-US";
    recognitionRef.current.continuous = true;
    recognitionRef.current.interimResults = true;

    recognitionRef.current.onresult = (event) => {
      let interimTranscript = "";
      let finalTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const { transcript } = event.results[i][0];
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      // Accumulate the final transcript
      if (finalTranscript) {
        finalTranscriptRef.current += finalTranscript;
        parseNewText(finalTranscript);
      }

      // Update displayed text
      setSpeechText(finalTranscriptRef.current + " " + interimTranscript);
    };

    recognitionRef.current.onerror = (e) => {
      console.error("Speech recognition error:", e.error);
    };

    recognitionRef.current.onend = () => {
      console.log("Speech recognition ended.");
      if (listening) {
        console.log("Auto-restarting recognition...");
        recognitionRef.current.start();
      }
    };

    recognitionRef.current.start();
    setListening(true);
    console.log("Speech recognition started");
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.onend = null; // prevent auto-restart
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setListening(false);
    console.log("Speech recognition stopped");
  };

  const toggleMic = () => {
    if (!listening) {
      finalTranscriptRef.current = "";
      setSpeechText("");
      startListening();
    } else {
      stopListening();
    }
  };

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      stopListening();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ======== RENDER ========
  // 1) Splash screen
  if (showSplash) {
    return (
      <div className="splash-screen" onClick={() => setShowSplash(false)}>
        <h1 className="splash-title">HI-5</h1>
        <p className="splash-subtitle">Tap anywhere to begin</p>
      </div>
    );
  }

  // 2) Main UI
  return (
    <div className="app">
      <h1 className="app-title">HI-5 Bionic Hand Control</h1>

      <button
        onClick={toggleMic}
        className={`mic-button ${listening ? "active" : ""}`}
      >
        {listening ? "Stop Listening" : "Start Listening"}
      </button>

      <div className="manual-controls">
        <h2>Manual Controls</h2>
        <div className="button-row">
          <button onClick={() => updateHandCommand("open")}>Open Hand</button>
          <button onClick={() => updateHandCommand("close")}>Close Hand</button>
        </div>
        <h3>Gesture Presets</h3>
        <div className="button-row presets">
          {Object.keys(handSigns).map((sign) => (
            <button key={sign} onClick={() => applyHandSign(sign)}>
              {sign}
            </button>
          ))}
        </div>
      </div>

      <div className="transcript-container">
        <h2>Transcript</h2>
        <div className="transcript-box">{speechText}</div>
      </div>
    </div>
  );
};

export default App;
