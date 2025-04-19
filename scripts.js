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
let spotifyAccessToken = null; // Will be set after successful auth
let userLikedSongs = []; // Stores IDs of tracks the user interacts with positively
// let pendingSpotifyRequest = null; // REMOVED - Simplifying auth flow

// --- Configuration ---

// Gemini API Key (Replace with your actual key)
// WARNING: Exposing API keys client-side is a security risk in production.
const GEMINI_API_KEY = "AIzaSyCVFniEjNZt74EGIrUfehhmtplfuiOYLGk"; // <--- REPLACE THIS IF NEEDED
const GEMINI_MODEL = "gemini-2.0-flash"; // Or your preferred model

// Spotify API Credentials (Replace with your actual Client ID)
const SPOTIFY_CLIENT_ID = "7d96f4a1753c4d679344bdd7e90bdd89"; // <--- REPLACE THIS IF NEEDED

// ***** IMPORTANT: Redirect URI points to your callback.html *****
const SPOTIFY_REDIRECT_URI =
  "https://spotify-music-finder-two.vercel.app/callback.html"; // Use your Vercel URL + /callback.html

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

function showTypingIndicator() {
  typingIndicator.classList.add("active");
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    typingIndicator.classList.remove("active");
  }, 1500);
}

function hideTypingIndicator() {
  clearTimeout(typingTimeout);
  typingIndicator.classList.remove("active");
}

function showApiProcessingIndicator() {
  apiProcessingIndicator.classList.add("active");
}

function hideApiProcessingIndicator() {
  apiProcessingIndicator.classList.remove("active");
}

function formatTimestamp(date) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// --- Login and Initialization ---

function login() {
  const username = usernameInput.value.trim();
  if (username === "") return;

  currentUser = username;
  loginContainer.style.display = "none";
  chatApp.style.display = "flex";
  messageInput.focus();

  console.log("User logged in as:", username);
  loadMessages();

  setTimeout(() => {
    const introMessage = {
      user: "AI",
      text: botIntroduction,
      timestamp: formatTimestamp(new Date()),
      avatar: "chatbot_profile.png",
    };
    const messages =
      JSON.parse(localStorage.getItem(`chatMessages_${currentUser}`)) || [];
    if (!messages.some((msg) => msg.text === botIntroduction)) {
      receiveMessage(introMessage);
    }
  }, 500);
}

// --- Messaging Functions ---

function sendMessage() {
  const messageText = messageInput.value.trim();
  if (messageText === "") return;

  hideTypingIndicator();

  const timestamp = formatTimestamp(new Date());
  const message = {
    user: currentUser,
    text: messageText,
    timestamp: timestamp,
    avatar: "EmptyProfilePic.webp",
  };

  appendMessageToChat(message);
  saveMessage(message);
  messageInput.value = "";
  processUserMessage(messageText);
}

function receiveMessage(message) {
  const botMessage = {
    user: "AI",
    text: message.text || "...",
    timestamp: message.timestamp || formatTimestamp(new Date()),
    avatar: message.avatar || "chatbot_profile.png",
    isHTML: message.isHTML || false,
  };

  console.log("Received message:", botMessage.text);
  appendMessageToChat(botMessage);
  saveMessage(botMessage);
  // Hide indicator ONLY if it wasn't an auth request message
  if (!botMessage.text?.includes("connect to Spotify first")) {
     hideApiProcessingIndicator();
  }
}

function createMessageElement(message) {
    const messageElement = document.createElement("div");
    messageElement.classList.add(
        "message",
        message.user === currentUser ? "user" : "other"
    );

    const avatarElement = document.createElement("img");
    avatarElement.src = message.avatar || (message.user === currentUser ? "EmptyProfilePic.webp" : "chatbot_profile.png");
    avatarElement.classList.add("avatar");
    avatarElement.alt = "Avatar";
    avatarElement.onerror = function() { this.src='https://placehold.co/35x35/cccccc/ffffff?text=?'; };

    const messageContentDiv = document.createElement("div");
    messageContentDiv.classList.add("message-content");

    const textDiv = document.createElement("div");
    if (message.isHTML) {
        textDiv.innerHTML = message.text;
    } else {
        textDiv.textContent = message.text;
    }

    const timestampDiv = document.createElement("div");
    timestampDiv.classList.add("timestamp");
    timestampDiv.textContent = message.timestamp;

    messageContentDiv.appendChild(textDiv);
    messageContentDiv.appendChild(timestampDiv);

    if (message.user === currentUser) {
        messageElement.appendChild(messageContentDiv);
        messageElement.appendChild(avatarElement);
    } else {
        messageElement.appendChild(avatarElement);
        messageElement.appendChild(messageContentDiv);
    }

    return messageElement;
}

function appendMessageToChat(message) {
    const messageElement = createMessageElement(message);
    const typingIndicatorElement = document.getElementById('typing-indicator');
    const apiIndicatorElement = document.getElementById('api-processing-indicator');

    if (apiIndicatorElement) {
        chatContainer.insertBefore(messageElement, apiIndicatorElement);
    } else if (typingIndicatorElement) {
         chatContainer.insertBefore(messageElement, typingIndicatorElement);
    } else {
        chatContainer.appendChild(messageElement);
    }
    chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
}


// --- Message Processing and API Calls ---

function processUserMessage(userMessage) {
  showApiProcessingIndicator();

  const lowerCaseMessage = userMessage.toLowerCase();
  let requiresSpotify = false;
  let spotifyAction = null; // Function to call if token exists

  if (lowerCaseMessage.startsWith("play ")) {
    requiresSpotify = true;
    spotifyAction = () => searchAndDisplaySongs(userMessage.substring(5).trim());
  } else if (lowerCaseMessage.startsWith("recommend ")) {
    requiresSpotify = true;
    spotifyAction = () => getRecommendationsBasedOnQuery(userMessage.substring(10).trim());
  } else if (lowerCaseMessage.startsWith("search for ")) {
     requiresSpotify = true;
     spotifyAction = () => searchAndDisplaySongs(userMessage.substring(11).trim());
  } else if (lowerCaseMessage.includes("like") || lowerCaseMessage.includes("favorite") || lowerCaseMessage.includes("love the song")) {
    handleUserPreference(userMessage);
    return;
  } else {
    getGeminiResponse(userMessage);
    return;
  }

  // Handle Spotify Actions
  if (requiresSpotify) {
      console.log(`Spotify action required. Token available? ${!!spotifyAccessToken}`);
      if (!spotifyAccessToken) {
          // No token, just initiate auth. User needs to repeat command after login.
          authenticateWithSpotify();
          // Keep indicator showing
      } else {
          // Token exists, perform the action immediately
          if (spotifyAction) {
              spotifyAction();
          } else {
              console.error("Spotify action was null?"); // Should not happen
              hideApiProcessingIndicator();
          }
      }
  }
}


// Search Spotify for tracks based on query
function searchAndDisplaySongs(query) {
  if (!query) {
      receiveMessage({ text: "What song or artist would you like me to search for?" });
      hideApiProcessingIndicator();
      return;
  }
  // Check token *before* logging or showing indicator for this specific action
  if (!spotifyAccessToken) {
      console.error("searchAndDisplaySongs called without Spotify token.");
      receiveMessage({ text: "Please connect to Spotify first by trying your command again." });
      authenticateWithSpotify(); // Trigger auth, user needs to retry command
      // Keep indicator showing from processUserMessage
      return;
  }

  console.log(`Searching Spotify for: ${query}. Using token: ${spotifyAccessToken ? spotifyAccessToken.substring(0, 10) + '...' : 'null'}`);
  showApiProcessingIndicator(); // Ensure indicator is shown

  const apiUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=5`;

  fetch(apiUrl, {
    headers: {
      Authorization: `Bearer ${spotifyAccessToken}`, // Send the token
    },
  })
    .then((response) => {
      if (response.status === 401) {
        // *** Simplified 401 Handling ***
        console.error("Spotify token expired or invalid during search.");
        spotifyAccessToken = null; // Clear invalid token
        // Inform user, let them retry the command to re-trigger auth
        receiveMessage({ text: "Your Spotify session expired. Please try your command again to reconnect." });
        // No automatic re-auth or pending request storage
        throw new Error("Spotify token expired"); // Stop processing this request
      }
      if (!response.ok) {
        // Try to parse error details from Spotify
        return response.json().then(err => {
             throw new Error(`Spotify API error: ${err.error?.message || response.statusText} (${response.status})`);
        }).catch(() => {
             throw new Error(`Spotify API error: ${response.statusText} (${response.status})`);
        });
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
      // Only show generic error if it wasn't the handled token expiry
      if (error.message !== "Spotify token expired") {
          receiveMessage({
            text: `Sorry, I had trouble searching Spotify: ${error.message}.`,
          });
      }
    })
    .finally(() => {
      // Always hide indicator after the attempt finishes (unless auth was triggered initially)
      hideApiProcessingIndicator();
    });
}

// Display song results in the chat
function displaySongResults(tracks) {
  let songListHTML = "<div class='song-results'><strong>Here are some songs I found:</strong>";
  tracks.forEach((track) => {
    const artists = track.artists.map((artist) => artist.name).join(", ");
    const trackId = track.id;
    const trackName = track.name;
    const albumImage =
      track.album.images.length > 0
        ? track.album.images[track.album.images.length - 1].url
        : "https://placehold.co/60x60/eeeeee/777777?text=Album";
    const escapedTrackName = trackName.replace(/"/g, '"').replace(/'/g, ''');
    const escapedArtists = artists.replace(/"/g, '"').replace(/'/g, ''');
    songListHTML += `
      <div class='song-item'>
        <img src='${albumImage}' alt='Album art for ${escapedTrackName}' class='song-thumbnail' onerror="this.src='https://placehold.co/60x60/eeeeee/777777?text=Err'">
        <div class='song-details'>
          <div class='song-title'>${trackName}</div>
          <div class='song-artist'>${artists}</div>
        </div>
        <button class='play-button' onclick='playSong("${trackId}", "${escapedTrackName}", "${escapedArtists}")' title='Play ${escapedTrackName}'>▶</button>
      </div>`;
  });
  songListHTML += "</div>";
  receiveMessage({ text: songListHTML, isHTML: true });
}

// Embed the Spotify player for the selected track
function playSong(trackId, trackName, artists) {
  console.log(`Playing song: ${trackName} by ${artists} (ID: ${trackId})`);
  const embedUrl = `https://open.spotify.com/embed/track/${trackId}`;
  const playerHTML = `
    <div class='spotify-player'>
      <iframe title="Spotify Embed Player for ${trackName}" style="border-radius:12px" src="${embedUrl}"
        width="100%" height="80" frameBorder="0" allowfullscreen=""
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"></iframe>
    </div>`;
  receiveMessage({
    text: `Now playing: <strong>${trackName}</strong> by ${artists}${playerHTML}`,
    isHTML: true,
  });
  if (!userLikedSongs.includes(trackId)) {
      userLikedSongs.push(trackId);
      if (userLikedSongs.length > 10) userLikedSongs.shift();
      console.log("Updated liked songs:", userLikedSongs);
  }
}

// Get recommendations based on a query
function getRecommendationsBasedOnQuery(query) {
   if (!spotifyAccessToken) {
      console.error("getRecommendationsBasedOnQuery called without Spotify token.");
      receiveMessage({ text: "Please connect to Spotify first by trying your command again." });
      authenticateWithSpotify();
      return;
   }
    console.log(`Getting recommendations based on: ${query}. Using token: ${spotifyAccessToken ? spotifyAccessToken.substring(0, 10) + '...' : 'null'}`);
    showApiProcessingIndicator();

    if (userLikedSongs.length > 0) {
        console.log("Using liked songs for recommendations:", userLikedSongs.slice(-5));
        getSpotifyRecommendations(userLikedSongs.slice(-5));
    } else if (query) {
        console.log(`Trying query "${query}" as genre/artist seed.`);
        getSpotifyRecommendations([], [query.toLowerCase()], []);
    } else {
        receiveMessage({ text: "What kind of music would you like recommendations for? (e.g., 'recommend rock music')" });
        hideApiProcessingIndicator();
    }
}

// Fetch recommendations from Spotify
function getSpotifyRecommendations(seedTracks = [], seedGenres = [], seedArtists = []) {
   if (!spotifyAccessToken) { // Double check token just before fetch
      console.error("getSpotifyRecommendations called without Spotify token (should not happen if called correctly).");
      receiveMessage({ text: "Session error. Please try your command again." });
      hideApiProcessingIndicator();
      return;
   }
    if (seedTracks.length === 0 && seedGenres.length === 0 && seedArtists.length === 0) {
        receiveMessage({ text: "I need something to base recommendations on!" });
        hideApiProcessingIndicator();
        return;
    }

    showApiProcessingIndicator();

    let apiUrl = `https://api.spotify.com/v1/recommendations?limit=5`;
    const params = [];
    if (seedTracks.length > 0) params.push(`seed_tracks=${seedTracks.slice(0, 5).filter(t => t).join(',')}`);
    if (seedGenres.length > 0) params.push(`seed_genres=${seedGenres.slice(0, 5).filter(g => g).join(',')}`);
    if (seedArtists.length > 0) params.push(`seed_artists=${seedArtists.slice(0, 5).filter(a => a).join(',')}`);
    if (params.length === 0) {
         receiveMessage({ text: "Invalid seeds provided for recommendations." });
         hideApiProcessingIndicator();
         return;
    }
    apiUrl += "&" + params.join('&');
    console.log("Recommendation API URL:", apiUrl);

    fetch(apiUrl, {
        headers: { Authorization: `Bearer ${spotifyAccessToken}` }, // Send the token
    })
    .then(response => {
        if (response.status === 401) {
            // *** Simplified 401 Handling ***
            console.error("Spotify token expired or invalid during recommendations.");
            spotifyAccessToken = null; // Clear invalid token
            receiveMessage({ text: "Your Spotify session expired. Please try your command again to reconnect." });
            throw new Error("Spotify token expired"); // Stop processing
        }
        if (!response.ok) {
            return response.json().then(err => {
                throw new Error(`Spotify API error: ${err.error?.message || response.statusText} (${response.status})`);
            }).catch(() => {
                throw new Error(`Spotify API error: ${response.statusText} (${response.status})`);
            });
        }
        return response.json();
    })
    .then(data => {
        if (data.tracks && data.tracks.length > 0) {
            receiveMessage({ text: "Here are some recommendations for you:" });
            displaySongResults(data.tracks);
        } else {
            receiveMessage({ text: "I couldn't find any recommendations based on that." });
        }
    })
    .catch(error => {
        console.error("Error getting Spotify recommendations:", error);
        if (error.message !== "Spotify token expired") {
             receiveMessage({ text: `Sorry, I had trouble getting recommendations: ${error.message}` });
        }
    })
    .finally(() => {
        hideApiProcessingIndicator();
    });
}


// Handle messages indicating user preference
function handleUserPreference(userMessage) {
    receiveMessage({
        text: "Got it! I'll keep that in mind for future recommendations.",
    });
    hideApiProcessingIndicator();
}

// Get response from Gemini API for general conversation
function getGeminiResponse(userMessage) {
  if (!GEMINI_API_KEY || GEMINI_API_KEY.includes("YOUR") || GEMINI_API_KEY.length < 10) {
      console.warn("Gemini API Key not set or invalid. Falling back.");
      const randomReply = prebuiltReplies[Math.floor(Math.random() * prebuiltReplies.length)];
      receiveMessage({ text: randomReply });
      return;
  }
  showApiProcessingIndicator();
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const prompt = `You are a friendly music chatbot. The user said: "${userMessage}". Respond conversationally. If they ask for music, guide them to use commands like 'play [song/artist]', 'recommend [genre/artist]', or 'search for [song]'. Keep responses brief (1-2 sentences). Do not use markdown formatting (like * or #).`;
  const requestBody = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 80 },
    safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
    ],
  };

  fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  })
    .then((response) => {
      if (!response.ok) {
        return response.json().then(err => { throw new Error(`Gemini API error: ${err.error?.message || response.statusText} (${response.status})`); })
                           .catch(() => { throw new Error(`Gemini API error: ${response.statusText} (${response.status})`); });
      }
      return response.json();
    })
    .then((data) => {
      let generatedText = "Sorry, I couldn't process that.";
      if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
          generatedText = data.candidates[0].content.parts[0].text;
      } else if (data.promptFeedback?.blockReason) {
           generatedText = "I can't respond due to safety guidelines.";
      }
      receiveMessage({ text: generatedText.replace(/[*#]/g, "").trim() });
    })
    .catch((error) => {
      console.error("Error calling Gemini API:", error);
      const randomReply = prebuiltReplies[Math.floor(Math.random() * prebuiltReplies.length)];
      receiveMessage({ text: `${randomReply} (Error: ${error.message})` });
    })
    .finally(() => {
      hideApiProcessingIndicator();
    });
}

// --- Spotify Authentication ---

function authenticateWithSpotify() {
  if (!SPOTIFY_CLIENT_ID || SPOTIFY_CLIENT_ID.includes("YOUR") || SPOTIFY_CLIENT_ID.length < 10) {
      receiveMessage({ text: "Spotify Client ID is not configured correctly." });
      console.error("Spotify Client ID is missing or invalid.");
      hideApiProcessingIndicator();
      return;
  }
  const scopes = ["user-read-private", "user-read-email"].join(" ");
  // Fixed: Using the correct Spotify authorization endpoint
  const authUrl = `https://accounts.spotify.com/authorize?client_id=${SPOTIFY_CLIENT_ID}&redirect_uri=${encodeURIComponent(SPOTIFY_REDIRECT_URI)}&scope=${encodeURIComponent(scopes)}&response_type=token&show_dialog=true`;

  const messages = chatContainer.querySelectorAll(".message.other");
  const lastMessageText = messages.length > 0 ? messages[messages.length - 1].textContent : "";
  // Avoid showing redundant messages if auth is triggered rapidly
  if (!lastMessageText.includes("connect to Spotify first") && !lastMessageText.includes("session expired")) {
       receiveMessage({ text: "I need to connect to Spotify first. Please log in via the popup window." });
  }

  const spotifyWindow = window.open(authUrl, "Spotify Login", "width=500,height=650,menubar=no,location=no,resizable=yes,scrollbars=yes,status=no");
  setTimeout(() => {
    if (!spotifyWindow || spotifyWindow.closed || typeof spotifyWindow.closed === 'undefined') {
        if (!lastMessageText.includes("popup was blocked")) {
             receiveMessage({ text: "Spotify login popup may be blocked by your browser. Please allow popups and try again." });
        }
        hideApiProcessingIndicator();
    }
  }, 1500);
}

// --- Handle Callback and Local Storage ---

// Listen for messages from the Spotify auth callback popup
window.addEventListener("message", function(event) {
    if (event.origin !== window.location.origin) {
        console.warn("Ignored message from unexpected origin:", event.origin);
        return;
    }

    if (event.data?.type === "spotify-auth-success") {
        console.log("Received Spotify token via postMessage. Token:", event.data.token ? event.data.token.substring(0, 10) + '...' : 'null');
        spotifyAccessToken = event.data.token; // Set the global token

        // Inform user, hide indicator as auth is now complete (unless a request was pending, which we removed)
         receiveMessage({ text: "Successfully connected to Spotify! You can now try your command again." });
         hideApiProcessingIndicator(); // Hide indicator after successful connection

        // // *** PENDING REQUEST LOGIC REMOVED ***
        // if (typeof pendingSpotifyRequest === 'function') {
        //     console.log("Executing pending Spotify request...");
        //     pendingSpotifyRequest();
        //     pendingSpotifyRequest = null;
        // } else {
        //     hideApiProcessingIndicator();
        // }

    } else if (event.data?.type === "spotify-auth-error") {
        console.error("Received Spotify auth error via postMessage:", event.data.error);
         receiveMessage({ text: `Spotify connection failed: ${event.data.error}. Please try again.` });
         hideApiProcessingIndicator(); // Hide indicator on error
    }
}, false);


// Save message to local storage
function saveMessage(message) {
  if (!currentUser) return;
  const userMessagesKey = `chatMessages_${currentUser}`;
  try {
      let messages = JSON.parse(localStorage.getItem(userMessagesKey)) || [];
      messages.push(message);
      if (messages.length > 50) messages = messages.slice(-50); // More efficient way to limit size
      localStorage.setItem(userMessagesKey, JSON.stringify(messages));
  } catch (e) {
      console.error("Error saving message to localStorage:", e);
      localStorage.removeItem(userMessagesKey); // Clear potentially corrupted data
  }
}

// Load messages from local storage
function loadMessages() {
  if (!currentUser) return;
  const userMessagesKey = `chatMessages_${currentUser}`;
  let messages = [];
   try {
       messages = JSON.parse(localStorage.getItem(userMessagesKey)) || [];
   } catch (e) {
       console.error("Error parsing messages from localStorage:", e);
       localStorage.removeItem(userMessagesKey);
   }

  chatContainer.innerHTML = ''; // Clear container
  chatContainer.appendChild(typingIndicator); // Add indicators back
  chatContainer.appendChild(apiProcessingIndicator);

  messages.forEach((message) => {
    if (message?.user && message?.text && message?.timestamp) {
        appendMessageToChat(message);
    } else {
        console.warn("Skipping invalid message from localStorage:", message);
    }
  });
  chatContainer.scrollTop = chatContainer.scrollHeight; // Scroll down
}

// --- Initialization ---
// (No specific init needed here now)