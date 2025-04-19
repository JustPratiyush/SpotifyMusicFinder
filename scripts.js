// DOM Elements
const chatContainer = document.getElementById("chat-container");
const messageInput = document.getElementById("message-input");
const typingIndicator = document.getElementById("typing-indicator");
const apiProcessingIndicator = document.getElementById(
  "api-processing-indicator"
);
const loginContainer = document.getElementById("login-container");
const chatApp = document.getElementById("chat-app");
const usernameInput = document.getElementById("username-input");

// State Variables
let typingTimeout;
let currentUser;
let spotifyAccessToken = null;
let userLikedSongs = []; // Stores IDs of tracks the user interacts with positively

// --- Configuration ---

// Gemini API Key (Replace with your actual key)
// WARNING: Exposing API keys client-side is a security risk in production.
// For local development or internal tools, this might be acceptable,
// but for public applications, use a backend proxy.
const GEMINI_API_KEY = "AIzaSyCVFniEjNZt74EGIrUfehhmtplfuiOYLGk"; // <--- REPLACE THIS
const GEMINI_MODEL = "gemini-2.0-flash"; // Or your preferred model

// Spotify API Credentials (Replace with your actual Client ID)
const SPOTIFY_CLIENT_ID = "7d96f4a1753c4d679344bdd7e90bdd89"; // <--- REPLACE THIS
// IMPORTANT: This Redirect URI MUST EXACTLY match the one registered
// in your Spotify Developer Dashboard for this application.
const SPOTIFY_REDIRECT_URI = window.location.origin + window.location.pathname; // Or your specific callback URL

// Fallback responses if Gemini API fails
const prebuiltReplies = [
  "Sorry, I couldn't connect right now. Maybe ask for a specific song?",
  "I'm having a little trouble thinking. Could you try asking differently?",
  "My connection seems weak. Try asking me to play a song by artist!",
];

// Bot introduction message
const botIntroduction =
  "Hi there! I'm your music chatbot. Ask me to play songs by artist, genre, or mood. You can also ask for recommendations!";

// --- Event Listeners ---

// Handle Enter key for login input
function handleLoginKey(event) {
  if (event.key === "Enter") {
    login();
  }
}

// Handle Enter key for message input and show typing indicator
function handleTyping(event) {
  if (event.key === "Enter") {
    sendMessage();
    return; // Prevent showing typing indicator after sending
  }
  showTypingIndicator();
}

// --- UI Functions ---

// Show the typing indicator and set a timeout to hide it
function showTypingIndicator() {
  typingIndicator.classList.add("active");
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    typingIndicator.classList.remove("active");
  }, 1500); // Hide after 1.5 seconds of no typing
}

// Hide the typing indicator
function hideTypingIndicator() {
  clearTimeout(typingTimeout); // Clear any existing timeout
  typingIndicator.classList.remove("active");
}

// Show the API processing indicator
function showApiProcessingIndicator() {
  apiProcessingIndicator.classList.add("active");
}

// Hide the API processing indicator
function hideApiProcessingIndicator() {
  apiProcessingIndicator.classList.remove("active");
}

// Format date object into HH:MM AM/PM string
function formatTimestamp(date) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// --- Login and Initialization ---

// Handle user login
function login() {
  const username = usernameInput.value.trim();
  if (username === "") return;

  currentUser = username;
  loginContainer.style.display = "none";
  chatApp.style.display = "flex"; // Show chat app
  messageInput.focus(); // Focus the message input field

  console.log("User logged in as:", username);

  // Load messages from local storage for the current user
  loadMessages();

  // Send introduction message from the bot
  setTimeout(() => {
    const introMessage = {
      user: "AI",
      text: botIntroduction,
      timestamp: formatTimestamp(new Date()),
      avatar: "chatbot_profile.png", // Replace with your bot avatar path
    };
    receiveMessage(introMessage); // Display the intro message
  }, 500); // Short delay after login
}

// --- Messaging Functions ---

// Send user message
function sendMessage() {
  const messageText = messageInput.value.trim();
  if (messageText === "") return;

  hideTypingIndicator(); // Hide typing indicator when message is sent

  const timestamp = formatTimestamp(new Date());
  const message = {
    user: currentUser,
    text: messageText,
    timestamp: timestamp,
    avatar: "EmptyProfilePic.webp", // Replace with user avatar logic if needed
  };

  // Display the user's message immediately
  appendMessageToChat(message);
  saveMessage(message); // Save to local storage

  // Clear input field
  messageInput.value = "";

  // Process the message for commands or pass to AI
  processUserMessage(messageText);
}

// Receive and display message from AI/Bot
function receiveMessage(message) {
  // Ensure message object has necessary properties
  const botMessage = {
    user: "AI",
    text: message.text || "...",
    timestamp: message.timestamp || formatTimestamp(new Date()),
    avatar: message.avatar || "chatbot_profile.png", // Default bot avatar
    isHTML: message.isHTML || false,
  };

  console.log("Received message:", botMessage.text);

  appendMessageToChat(botMessage);
  saveMessage(botMessage); // Save bot message to local storage

  // Hide API processing indicator after receiving message
  hideApiProcessingIndicator();
}

// Create HTML element for a message
function createMessageElement(message) {
  const messageElement = document.createElement("div");
  messageElement.classList.add(
    "message",
    message.user === currentUser ? "user" : "other"
  );

  const avatarElement = document.createElement("img");
  avatarElement.src =
    message.avatar ||
    (message.user === currentUser
      ? "EmptyProfilePic.webp"
      : "chatbot_profile.png");
  avatarElement.classList.add("avatar");
  avatarElement.alt = "Avatar";

  const messageContentDiv = document.createElement("div");
  messageContentDiv.classList.add("message-content");

  const textDiv = document.createElement("div");
  if (message.isHTML) {
    // Use innerHTML only if the flag is explicitly set
    // Be cautious with HTML injection
    textDiv.innerHTML = message.text;
  } else {
    // Use textContent for plain text to prevent XSS
    textDiv.textContent = message.text;
  }

  const timestampDiv = document.createElement("div");
  timestampDiv.classList.add("timestamp");
  timestampDiv.textContent = message.timestamp;

  messageContentDiv.appendChild(textDiv);
  messageContentDiv.appendChild(timestampDiv);

  // Append avatar and content based on user type
  if (message.user === currentUser) {
    messageElement.appendChild(messageContentDiv);
    messageElement.appendChild(avatarElement);
  } else {
    messageElement.appendChild(avatarElement);
    messageElement.appendChild(messageContentDiv);
  }

  return messageElement;
}

// Append message element to chat and scroll down
function appendMessageToChat(message) {
  const messageElement = createMessageElement(message);
  chatContainer.appendChild(messageElement);
  // Scroll to the bottom smoothly
  chatContainer.scrollTo({
    top: chatContainer.scrollHeight,
    behavior: "smooth",
  });
}

// --- Message Processing and API Calls ---

// Determine how to handle the user's message
function processUserMessage(userMessage) {
  showApiProcessingIndicator(); // Show indicator while processing

  const lowerCaseMessage = userMessage.toLowerCase();

  // Check for Spotify authentication requirement first
  if (
    !spotifyAccessToken &&
    (lowerCaseMessage.includes("play") ||
      lowerCaseMessage.includes("recommend") ||
      lowerCaseMessage.includes("search"))
  ) {
    authenticateWithSpotify();
    hideApiProcessingIndicator(); // Hide indicator as auth prompt is shown
    return;
  }

  // Prioritize specific commands
  if (lowerCaseMessage.startsWith("play ")) {
    const query = userMessage.substring(5).trim();
    searchAndDisplaySongs(query);
  } else if (lowerCaseMessage.startsWith("recommend ")) {
    const query = userMessage.substring(10).trim();
    getRecommendationsBasedOnQuery(query);
  } else if (lowerCaseMessage.startsWith("search for ")) {
    const query = userMessage.substring(11).trim();
    searchAndDisplaySongs(query);
  } else if (
    lowerCaseMessage.includes("like") ||
    lowerCaseMessage.includes("favorite") ||
    lowerCaseMessage.includes("love the song")
  ) {
    // Handle preference indication (simple acknowledgement for now)
    handleUserPreference(userMessage);
  } else {
    // Default to Gemini for general conversation or less specific requests
    getGeminiResponse(userMessage);
  }
}

// Search Spotify for tracks based on query
function searchAndDisplaySongs(query) {
  if (!query) {
    receiveMessage({
      text: "What song or artist would you like me to search for?",
    });
    return;
  }
  console.log(`Searching Spotify for: ${query}`);

  // Correct Spotify Search API endpoint
  const apiUrl = `https://api.spotify.com/v1/search${encodeURIComponent(
    query
  )}&type=track&limit=5`;

  fetch(apiUrl, {
    headers: {
      Authorization: `Bearer ${spotifyAccessToken}`,
    },
  })
    .then((response) => {
      if (response.status === 401) {
        // Access token expired or invalid
        console.error("Spotify token expired or invalid. Re-authenticating...");
        authenticateWithSpotify(); // Trigger re-authentication
        throw new Error("Spotify authentication required"); // Stop processing this request
      }
      if (!response.ok) {
        throw new Error(`Spotify API error: ${response.statusText}`);
      }
      return response.json();
    })
    .then((data) => {
      if (data.tracks && data.tracks.items && data.tracks.items.length > 0) {
        displaySongResults(data.tracks.items);
      } else {
        receiveMessage({
          text: `I couldn't find any songs matching "${query}". Try searching by artist or a different title.`,
        });
      }
    })
    .catch((error) => {
      console.error("Error searching Spotify:", error);
      if (error.message !== "Spotify authentication required") {
        // Avoid double message on auth error
        receiveMessage({
          text: "Sorry, I had trouble searching Spotify right now. Please check your connection or try again later.",
        });
      }
    })
    .finally(() => {
      // Ensure indicator is hidden even if auth was triggered
      hideApiProcessingIndicator();
    });
}

// Display song results in the chat
function displaySongResults(tracks) {
  let songListHTML =
    "<div class='song-results'><strong>Here are some songs I found:</strong>";

  tracks.forEach((track) => {
    const artists = track.artists.map((artist) => artist.name).join(", ");
    const trackId = track.id;
    const trackName = track.name;
    // Use a placeholder if no album image is available
    const albumImage =
      track.album.images.length > 0
        ? track.album.images[track.album.images.length - 1].url // Get smallest image
        : "https://placehold.co/60x60/grey/white?text=Album"; // Placeholder image

    // Escape quotes in names for the onclick attribute
    const escapedTrackName = trackName.replace(/"/g, "&quot;");
    const escapedArtists = artists.replace(/"/g, "&quot;");

    songListHTML += `
      <div class='song-item'>
        <img src='${albumImage}' alt='Album art for ${escapedTrackName}' class='song-thumbnail'>
        <div class='song-details'>
          <div class='song-title'>${trackName}</div>
          <div class='song-artist'>${artists}</div>
        </div>
        <button class='play-button' onclick='playSong("${trackId}", "${escapedTrackName}", "${escapedArtists}")' title='Play ${escapedTrackName}'>▶</button>
      </div>
    `;
  });

  songListHTML += "</div>";

  receiveMessage({
    text: songListHTML, // Send the generated HTML
    isHTML: true, // Mark message as HTML content
  });
}

// Embed the Spotify player for the selected track
function playSong(trackId, trackName, artists) {
  console.log(`Playing song: ${trackName} by ${artists} (ID: ${trackId})`);

  // Correct Spotify Embed URL
  const embedUrl = `https://open.spotify.com/embed/track/${trackId}`;

  const playerHTML = `
    <div class='spotify-player'>
      <iframe style="border-radius:12px" src="${embedUrl}"
        width="100%" height="80" frameBorder="0" allowfullscreen=""
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"></iframe>
    </div>
  `;

  receiveMessage({
    text: `Now playing: <strong>${trackName}</strong> by ${artists}${playerHTML}`,
    isHTML: true,
  });

  // Optional: Add track ID to user's liked songs for potential future recommendations
  if (!userLikedSongs.includes(trackId)) {
    userLikedSongs.push(trackId);
    if (userLikedSongs.length > 10) {
      userLikedSongs.shift(); // Keep only the last 10 played/liked songs
    }
    console.log("Updated liked songs:", userLikedSongs);
  }
}

// Get recommendations based on a query (could be genre, artist, or based on liked songs)
function getRecommendationsBasedOnQuery(query) {
  console.log(`Getting recommendations based on: ${query}`);

  // Simple logic: If user has liked songs, use those. Otherwise, try query as genre/artist.
  if (userLikedSongs.length > 0) {
    console.log(
      "Using liked songs for recommendations:",
      userLikedSongs.slice(-5)
    );
    getSpotifyRecommendations(userLikedSongs.slice(-5)); // Use last 5 liked songs
  } else if (query) {
    // Try interpreting the query as a genre first
    console.log(`Trying query "${query}" as genre/artist seed.`);
    // Note: Spotify recommendation API works best with multiple seeds (up to 5 total)
    // This is a simplified approach using only the query.
    // A more robust solution would involve searching for the query to get artist/track IDs first.
    getSpotifyRecommendations([], [query], []); // Seed by genre (assuming query is a genre)
  } else {
    receiveMessage({
      text: "What kind of music would you like recommendations for? (e.g., 'recommend rock music', 'recommend songs like The Beatles')",
    });
    hideApiProcessingIndicator();
  }
}

// Fetch recommendations from Spotify based on seed tracks, genres, or artists
function getSpotifyRecommendations(
  seedTracks = [],
  seedGenres = [],
  seedArtists = []
) {
  if (
    seedTracks.length === 0 &&
    seedGenres.length === 0 &&
    seedArtists.length === 0
  ) {
    receiveMessage({
      text: "I need something to base recommendations on! Try liking a song first, or ask for recommendations based on a genre or artist.",
    });
    hideApiProcessingIndicator();
    return;
  }

  // Construct the API URL for recommendations
  let apiUrl = `https://api.spotify.com/v1/recommendations?limit=5&seed_tracks=$2`;
  const params = [];
  if (seedTracks.length > 0)
    params.push(`seed_tracks=${seedTracks.slice(0, 5).join(",")}`); // Max 5 seeds
  if (seedGenres.length > 0)
    params.push(`seed_genres=${seedGenres.slice(0, 5).join(",")}`);
  if (seedArtists.length > 0)
    params.push(`seed_artists=${seedArtists.slice(0, 5).join(",")}`);

  apiUrl += params.join("&");
  console.log("Recommendation API URL:", apiUrl);

  fetch(apiUrl, {
    headers: { Authorization: `Bearer ${spotifyAccessToken}` },
  })
    .then((response) => {
      if (response.status === 401) {
        authenticateWithSpotify();
        throw new Error("Spotify authentication required");
      }
      if (!response.ok) {
        throw new Error(`Spotify API error: ${response.statusText}`);
      }
      return response.json();
    })
    .then((data) => {
      if (data.tracks && data.tracks.length > 0) {
        receiveMessage({ text: "Here are some recommendations for you:" });
        displaySongResults(data.tracks);
      } else {
        receiveMessage({
          text: "I couldn't find any recommendations based on that. Maybe try a broader genre or a different artist?",
        });
      }
    })
    .catch((error) => {
      console.error("Error getting Spotify recommendations:", error);
      if (error.message !== "Spotify authentication required") {
        receiveMessage({
          text: "Sorry, I had trouble getting recommendations right now.",
        });
      }
    })
    .finally(() => hideApiProcessingIndicator());
}

// Handle messages indicating user preference
function handleUserPreference(userMessage) {
  // Simple acknowledgement for now. Could be expanded to extract song/artist.
  receiveMessage({
    text: "Got it! I'll keep that in mind for future recommendations.",
  });
  // No need to hide indicator here, as receiveMessage does it.
}

// Get response from Gemini API for general conversation
function getGeminiResponse(userMessage) {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === "YOUR_GEMINI_API_KEY") {
    console.warn("Gemini API Key not set. Falling back to prebuilt replies.");
    const randomReply =
      prebuiltReplies[Math.floor(Math.random() * prebuiltReplies.length)];
    receiveMessage({ text: randomReply });
    return;
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  // Basic prompt to keep responses conversational and focused on music
  const prompt = `You are a friendly music chatbot. The user said: "${userMessage}". Respond conversationally. If they ask for music, guide them to use commands like 'play [song/artist]', 'recommend [genre/artist]', or 'search for [song]'. Keep responses brief (1-2 sentences). Do not use markdown.`;

  const requestBody = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 80,
    },
    // Safety settings (optional, adjust as needed)
    safetySettings: [
      {
        category: "HARM_CATEGORY_HARASSMENT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE",
      },
      {
        category: "HARM_CATEGORY_HATE_SPEECH",
        threshold: "BLOCK_MEDIUM_AND_ABOVE",
      },
      {
        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE",
      },
      {
        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE",
      },
    ],
  };

  fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  })
    .then((response) => {
      if (!response.ok) {
        // Log detailed error if possible
        return response
          .json()
          .then((err) => {
            console.error("Gemini API Error Response:", err);
            throw new Error(`Gemini API error: ${response.statusText}`);
          })
          .catch(() => {
            throw new Error(`Gemini API error: ${response.statusText}`); // Fallback if error body isn't JSON
          });
      }
      return response.json();
    })
    .then((data) => {
      // Extract text, handling potential variations in response structure
      let generatedText = "Sorry, I couldn't process that."; // Default fallback
      if (
        data.candidates &&
        data.candidates.length > 0 &&
        data.candidates[0].content &&
        data.candidates[0].content.parts &&
        data.candidates[0].content.parts.length > 0
      ) {
        generatedText = data.candidates[0].content.parts[0].text;
      } else {
        console.warn("Unexpected Gemini API response structure:", data);
      }

      // Basic cleanup (remove potential markdown, trim)
      const cleanedText = generatedText.replace(/[*#]/g, "").trim();

      receiveMessage({ text: cleanedText });
    })
    .catch((error) => {
      console.error("Error calling Gemini API:", error);
      const randomReply =
        prebuiltReplies[Math.floor(Math.random() * prebuiltReplies.length)];
      receiveMessage({ text: randomReply });
    })
    .finally(() => {
      // Ensure indicator is hidden even after errors
      hideApiProcessingIndicator();
    });
}

// --- Spotify Authentication ---

// Initiate Spotify Authentication using Implicit Grant Flow
function authenticateWithSpotify() {
  if (!SPOTIFY_CLIENT_ID || SPOTIFY_CLIENT_ID === "YOUR_SPOTIFY_CLIENT_ID") {
    receiveMessage({
      text: "Spotify Client ID is not configured. Cannot connect to Spotify.",
    });
    console.error("Spotify Client ID is missing in scripts.js");
    return;
  }

  // Scopes define the permissions your app requests
  const scopes = [
    "user-read-private", // Read user profile
    "user-read-email", // Read user email
    "streaming", // Required for playback control (though not used with Embed)
    // Add other scopes if needed, e.g., 'playlist-read-private'
  ].join(" ");

  // Correct Spotify Authorize URL
  const authUrl = `https://api.spotify.com/v1/recommendations?limit=5&seed_tracks=$1?client_id=${SPOTIFY_CLIENT_ID}&redirect_uri=${encodeURIComponent(
    SPOTIFY_REDIRECT_URI
  )}&scope=${encodeURIComponent(scopes)}&response_type=token&show_dialog=true`; // show_dialog forces login prompt

  // Inform the user
  receiveMessage({
    text: "I need to connect to Spotify first. Please log in via the popup window.",
  });

  // Open the Spotify login page in a popup window
  // Note: Popups can be blocked by browsers. Consider a full redirect approach for production.
  const spotifyWindow = window.open(
    authUrl,
    "Spotify Login",
    "width=500,height=600,menubar=no,location=no,resizable=yes,scrollbars=yes,status=no" // Basic popup features
  );

  // Check if the popup was blocked
  setTimeout(() => {
    if (
      !spotifyWindow ||
      spotifyWindow.closed ||
      typeof spotifyWindow.closed === "undefined"
    ) {
      receiveMessage({
        text: "It seems the Spotify login popup was blocked by your browser. Please allow popups for this site and try the command again.",
      });
    }
  }, 1000); // Check after 1 second

  // The actual token retrieval happens in the `handleSpotifyCallback` function
  // which is called when the page loads (checking the URL hash).
}

// Handle the Spotify redirect callback (Implicit Grant)
function handleSpotifyCallback() {
  // Check if the current URL hash contains Spotify auth info
  if (window.location.hash) {
    const hashParams = window.location.hash
      .substring(1) // Remove the '#'
      .split("&")
      .reduce((acc, item) => {
        if (item) {
          const parts = item.split("=");
          acc[parts[0]] = decodeURIComponent(parts[1]);
        }
        return acc;
      }, {});

    if (hashParams.access_token) {
      console.log("Spotify access token received.");
      spotifyAccessToken = hashParams.access_token;

      // Optionally store the token expiration time if provided (expires_in is in seconds)
      // const expiresIn = hashParams.expires_in;
      // if (expiresIn) {
      //     const expiryTime = new Date().getTime() + expiresIn * 1000;
      //     localStorage.setItem('spotify_token_expiry', expiryTime);
      // }

      // Clear the hash from the URL to avoid re-processing
      window.location.hash = "";

      // Inform the user (if this wasn't triggered by a popup closing)
      // Check if the window was opened by the app itself (simple check)
      if (!window.opener) {
        receiveMessage({
          text: "Successfully connected to Spotify! You can now ask for songs and recommendations.",
        });
      } else {
        // If it's a popup, attempt to notify the opener window (less reliable)
        // This part is tricky with cross-origin policies if domains differ.
        // For same-origin (like file:// or localhost), it might work.
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(
              { type: "spotify-auth-success", token: spotifyAccessToken },
              window.location.origin
            );
            // Close the popup automatically after success
            window.close();
          }
        } catch (e) {
          console.warn("Could not post message to opener window:", e);
          // Provide instructions if popup doesn't close automatically
          receiveMessage({
            text: "Spotify connection successful! You can close this window/tab and return to the chat.",
          });
        }
      }
    } else if (hashParams.error) {
      console.error("Spotify authentication error:", hashParams.error);
      receiveMessage({
        text: `Spotify connection failed: ${hashParams.error}. Please try again.`,
      });
      window.location.hash = ""; // Clear error hash
    }
  }
}

// Listen for messages from the Spotify auth popup (alternative to hash checking if using postMessage)
window.addEventListener(
  "message",
  function (event) {
    // Basic security check: ensure the message comes from the expected origin (your own)
    if (event.origin !== window.location.origin) {
      // console.warn("Ignored message from unexpected origin:", event.origin);
      return;
    }

    if (event.data && event.data.type === "spotify-auth-success") {
      console.log("Received Spotify token via postMessage from popup.");
      spotifyAccessToken = event.data.token;
      receiveMessage({
        text: "Successfully reconnected to Spotify!",
      });
      // Optionally close the popup if it's still open (though it should close itself)
      // event.source.close();
    }
  },
  false
);

// --- Local Storage ---

// Save message to local storage, associated with the current user
function saveMessage(message) {
  if (!currentUser) return; // Don't save if no user is logged in
  const userMessagesKey = `chatMessages_${currentUser}`;
  const messages = JSON.parse(localStorage.getItem(userMessagesKey)) || [];
  messages.push(message);
  // Limit stored messages to avoid excessive storage use (e.g., last 50)
  if (messages.length > 50) {
    messages.shift();
  }
  localStorage.setItem(userMessagesKey, JSON.stringify(messages));
}

// Load messages from local storage for the current user
function loadMessages() {
  if (!currentUser) return;
  const userMessagesKey = `chatMessages_${currentUser}`;
  const messages = JSON.parse(localStorage.getItem(userMessagesKey)) || [];
  chatContainer.innerHTML = ""; // Clear existing messages before loading
  messages.forEach((message) => {
    appendMessageToChat(message); // Use append function to create elements
  });
  // Add back the indicators after loading messages
  chatContainer.appendChild(typingIndicator);
  chatContainer.appendChild(apiProcessingIndicator);

  // Scroll to the bottom after loading messages
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// --- Initialization ---

// Check for Spotify callback when the page loads
window.addEventListener("load", handleSpotifyCallback);

// Optional: Check for stored access token on load (less common with Implicit Grant)
// window.addEventListener("load", () => {
//     const storedToken = localStorage.getItem('spotify_access_token');
//     const expiryTime = localStorage.getItem('spotify_token_expiry');
//     if (storedToken && expiryTime && new Date().getTime() < expiryTime) {
//         console.log("Using stored Spotify token.");
//         spotifyAccessToken = storedToken;
//     }
// });
