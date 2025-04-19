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
let pendingSpotifyRequest = null; // Store the function to call after auth

// --- Configuration ---

// Gemini API Key (Replace with your actual key)
// WARNING: Exposing API keys client-side is a security risk in production.
const GEMINI_API_KEY = "AIzaSyCVFniEjNZt74EGIrUfehhmtplfuiOYLGk"; // <--- REPLACE THIS IF NEEDED
const GEMINI_MODEL = "gemini-pro"; // Or your preferred model

// Spotify API Credentials (Replace with your actual Client ID)
const SPOTIFY_CLIENT_ID = "7d96f4a1753c4d679344bdd7e90bdd89"; // <--- REPLACE THIS IF NEEDED

// ***** IMPORTANT: Update Redirect URI to point to your callback.html *****
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
    // Check if intro message already exists to avoid duplicates on reload
    const messages =
      JSON.parse(localStorage.getItem(`chatMessages_${currentUser}`)) || [];
    if (!messages.some((msg) => msg.text === botIntroduction)) {
      receiveMessage(introMessage); // Display the intro message only if not present
    }
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
  // Add error handling for avatar images
  avatarElement.onerror = function () {
    this.src = "https://placehold.co/35x35/cccccc/ffffff?text=?";
  };

  const messageContentDiv = document.createElement("div");
  messageContentDiv.classList.add("message-content");

  const textDiv = document.createElement("div");
  if (message.isHTML) {
    // Use innerHTML only if the flag is explicitly set
    // Sanitize HTML if it comes from untrusted sources (like Gemini)
    // For Spotify results/player, it's generally safe as we construct it
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
  // Find indicators and insert message before them
  const typingIndicatorElement = document.getElementById("typing-indicator");
  const apiIndicatorElement = document.getElementById(
    "api-processing-indicator"
  );

  if (apiIndicatorElement) {
    chatContainer.insertBefore(messageElement, apiIndicatorElement);
  } else if (typingIndicatorElement) {
    chatContainer.insertBefore(messageElement, typingIndicatorElement);
  } else {
    chatContainer.appendChild(messageElement); // Fallback if indicators aren't found
  }

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
  let requiresSpotify = false;
  let spotifyAction = null;

  // Determine if Spotify action is needed and which one
  if (lowerCaseMessage.startsWith("play ")) {
    requiresSpotify = true;
    spotifyAction = () =>
      searchAndDisplaySongs(userMessage.substring(5).trim());
  } else if (lowerCaseMessage.startsWith("recommend ")) {
    requiresSpotify = true;
    spotifyAction = () =>
      getRecommendationsBasedOnQuery(userMessage.substring(10).trim());
  } else if (lowerCaseMessage.startsWith("search for ")) {
    requiresSpotify = true;
    spotifyAction = () =>
      searchAndDisplaySongs(userMessage.substring(11).trim());
  } else if (
    lowerCaseMessage.includes("like") ||
    lowerCaseMessage.includes("favorite") ||
    lowerCaseMessage.includes("love the song")
  ) {
    // Preference doesn't strictly require Spotify immediately, just acknowledge
    handleUserPreference(userMessage);
    return; // Exit after handling preference
  } else {
    // Default to Gemini for general conversation
    getGeminiResponse(userMessage);
    return; // Exit after calling Gemini
  }

  // --- Handle Spotify Actions ---
  if (requiresSpotify) {
    if (!spotifyAccessToken) {
      // No token, initiate auth and store the action to perform later
      pendingSpotifyRequest = spotifyAction; // Store the function itself
      authenticateWithSpotify();
      // Don't hide indicator here, wait for auth result
    } else {
      // Token exists, perform the action immediately
      spotifyAction();
    }
  }
}

// Search Spotify for tracks based on query
function searchAndDisplaySongs(query) {
  if (!query) {
    receiveMessage({
      text: "What song or artist would you like me to search for?",
    });
    hideApiProcessingIndicator(); // Hide indicator as no action taken
    return;
  }
  if (!spotifyAccessToken) {
    console.error("searchAndDisplaySongs called without Spotify token.");
    receiveMessage({ text: "Please connect to Spotify first." });
    authenticateWithSpotify(); // Re-trigger auth if called incorrectly
    hideApiProcessingIndicator();
    return;
  }

  console.log(`Searching Spotify for: ${query}`);
  showApiProcessingIndicator(); // Ensure indicator is shown for this action

  // Correct Spotify Search API endpoint
  const apiUrl = `https://api.spotify.com/v1/recommendations?limit=5&seed_tracks=$7{encodeURIComponent(query)}&type=track&limit=5`;

  fetch(apiUrl, {
    headers: {
      Authorization: `Bearer ${spotifyAccessToken}`,
    },
  })
    .then((response) => {
      if (response.status === 401) {
        console.error(
          "Spotify token expired or invalid during search. Re-authenticating..."
        );
        spotifyAccessToken = null; // Clear invalid token
        pendingSpotifyRequest = () => searchAndDisplaySongs(query); // Set this search as pending
        authenticateWithSpotify(); // Trigger re-authentication
        throw new Error("Spotify authentication required"); // Stop processing this request
      }
      if (!response.ok) {
        throw new Error(
          `Spotify API error: ${response.statusText} (${response.status})`
        );
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
      // Hide indicator unless authentication is pending
      if (!pendingSpotifyRequest) {
        hideApiProcessingIndicator();
      }
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
        : "https://placehold.co/60x60/eeeeee/777777?text=Album"; // Placeholder image

    // Escape quotes in names for the onclick attribute
    const escapedTrackName = trackName
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
    const escapedArtists = artists
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

    songListHTML += `
      <div class='song-item'>
        <img src='${albumImage}' alt='Album art for ${escapedTrackName}' class='song-thumbnail' onerror="this.src='https://placehold.co/60x60/eeeeee/777777?text=Err'">
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
      <iframe title="Spotify Embed Player for ${trackName}" style="border-radius:12px" src="${embedUrl}"
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
    // Maybe save liked songs to localStorage too?
    // localStorage.setItem(`spotifyLikedSongs_${currentUser}`, JSON.stringify(userLikedSongs));
  }
}

// Get recommendations based on a query (could be genre, artist, or based on liked songs)
function getRecommendationsBasedOnQuery(query) {
  if (!spotifyAccessToken) {
    console.error(
      "getRecommendationsBasedOnQuery called without Spotify token."
    );
    receiveMessage({ text: "Please connect to Spotify first." });
    pendingSpotifyRequest = () => getRecommendationsBasedOnQuery(query); // Set this action as pending
    authenticateWithSpotify(); // Re-trigger auth
    hideApiProcessingIndicator();
    return;
  }
  console.log(`Getting recommendations based on: ${query}`);
  showApiProcessingIndicator(); // Ensure indicator is shown

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
    // A more robust solution would search Spotify first to get actual genre/artist IDs.
    getSpotifyRecommendations([], [query.toLowerCase()], []); // Seed by genre (assuming query is a genre)
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
  if (!spotifyAccessToken) {
    console.error("getSpotifyRecommendations called without Spotify token.");
    receiveMessage({ text: "Please connect to Spotify first." });
    // Don't set pending request here as it might overwrite the original trigger
    authenticateWithSpotify();
    hideApiProcessingIndicator();
    return;
  }
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

  showApiProcessingIndicator(); // Ensure indicator is shown

  // Construct the API URL for recommendations
  let apiUrl = `https://api.spotify.com/v1/recommendations?limit=5&seed_tracks=$2`;
  const params = [];
  // Filter out empty seeds before joining
  if (seedTracks.length > 0)
    params.push(
      `seed_tracks=${seedTracks
        .slice(0, 5)
        .filter((t) => t)
        .join(",")}`
    );
  if (seedGenres.length > 0)
    params.push(
      `seed_genres=${seedGenres
        .slice(0, 5)
        .filter((g) => g)
        .join(",")}`
    );
  if (seedArtists.length > 0)
    params.push(
      `seed_artists=${seedArtists
        .slice(0, 5)
        .filter((a) => a)
        .join(",")}`
    );

  // Ensure at least one seed type is present after filtering
  if (params.length === 0) {
    receiveMessage({ text: "Invalid seeds provided for recommendations." });
    hideApiProcessingIndicator();
    return;
  }

  apiUrl += params.join("&") + "&limit=5"; // Add limit
  console.log("Recommendation API URL:", apiUrl);

  fetch(apiUrl, {
    headers: { Authorization: `Bearer ${spotifyAccessToken}` },
  })
    .then((response) => {
      if (response.status === 401) {
        console.error(
          "Spotify token expired or invalid during recommendations. Re-authenticating..."
        );
        spotifyAccessToken = null; // Clear invalid token
        // Store the recommendation request as pending. Need to capture the seeds.
        pendingSpotifyRequest = () =>
          getSpotifyRecommendations(seedTracks, seedGenres, seedArtists);
        authenticateWithSpotify();
        throw new Error("Spotify authentication required");
      }
      if (!response.ok) {
        // Try to get error message from Spotify response body
        return response
          .json()
          .then((err) => {
            console.error("Spotify Recommendation API Error Response:", err);
            throw new Error(
              `Spotify API error: ${
                err.error?.message || response.statusText
              } (${response.status})`
            );
          })
          .catch(() => {
            // Fallback if response body isn't JSON or doesn't have expected structure
            throw new Error(
              `Spotify API error: ${response.statusText} (${response.status})`
            );
          });
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
          text: `Sorry, I had trouble getting recommendations: ${error.message}`,
        });
      }
    })
    .finally(() => {
      // Hide indicator unless authentication is pending
      if (!pendingSpotifyRequest) {
        hideApiProcessingIndicator();
      }
    });
}

// Handle messages indicating user preference
function handleUserPreference(userMessage) {
  // Simple acknowledgement. Could extract song/artist mentioned.
  receiveMessage({
    text: "Got it! I'll keep that in mind for future recommendations.",
  });
  hideApiProcessingIndicator(); // Hide indicator as this is a final response
}

// Get response from Gemini API for general conversation
function getGeminiResponse(userMessage) {
  if (
    !GEMINI_API_KEY ||
    GEMINI_API_KEY.includes("YOUR") ||
    GEMINI_API_KEY.length < 10
  ) {
    // Basic check
    console.warn(
      "Gemini API Key not set or invalid. Falling back to prebuilt replies."
    );
    const randomReply =
      prebuiltReplies[Math.floor(Math.random() * prebuiltReplies.length)];
    receiveMessage({ text: randomReply });
    return;
  }

  showApiProcessingIndicator(); // Ensure indicator is shown

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const prompt = `You are a friendly music chatbot. The user said: "${userMessage}". Respond conversationally. If they ask for music, guide them to use commands like 'play [song/artist]', 'recommend [genre/artist]', or 'search for [song]'. Keep responses brief (1-2 sentences). Do not use markdown formatting (like * or #).`;

  const requestBody = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 80,
    },
    safetySettings: [
      // Adjust safety settings as needed
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
        return response
          .json()
          .then((err) => {
            console.error("Gemini API Error Response:", err);
            throw new Error(
              `Gemini API error: ${
                err.error?.message || response.statusText
              } (${response.status})`
            );
          })
          .catch(() => {
            throw new Error(
              `Gemini API error: ${response.statusText} (${response.status})`
            );
          });
      }
      return response.json();
    })
    .then((data) => {
      let generatedText = "Sorry, I couldn't process that.";
      // Check response structure carefully based on Gemini API docs
      if (
        data.candidates &&
        data.candidates.length > 0 &&
        data.candidates[0].content &&
        data.candidates[0].content.parts &&
        data.candidates[0].content.parts.length > 0
      ) {
        generatedText = data.candidates[0].content.parts[0].text;
      } else if (data.promptFeedback && data.promptFeedback.blockReason) {
        console.warn(
          "Gemini request blocked:",
          data.promptFeedback.blockReason
        );
        generatedText =
          "I can't respond to that request due to safety guidelines.";
      } else {
        console.warn("Unexpected Gemini API response structure:", data);
      }

      const cleanedText = generatedText.replace(/[*#]/g, "").trim(); // Basic cleanup
      receiveMessage({ text: cleanedText });
    })
    .catch((error) => {
      console.error("Error calling Gemini API:", error);
      const randomReply =
        prebuiltReplies[Math.floor(Math.random() * prebuiltReplies.length)];
      receiveMessage({ text: `${randomReply} (Error: ${error.message})` }); // Show error to user
    })
    .finally(() => {
      hideApiProcessingIndicator(); // Always hide indicator here
    });
}

// --- Spotify Authentication ---

// Initiate Spotify Authentication using Implicit Grant Flow
function authenticateWithSpotify() {
  if (
    !SPOTIFY_CLIENT_ID ||
    SPOTIFY_CLIENT_ID.includes("YOUR") ||
    SPOTIFY_CLIENT_ID.length < 10
  ) {
    receiveMessage({
      text: "Spotify Client ID is not configured correctly. Cannot connect to Spotify.",
    });
    console.error("Spotify Client ID is missing or invalid in scripts.js");
    hideApiProcessingIndicator(); // Hide indicator as we can't proceed
    pendingSpotifyRequest = null; // Clear any pending request
    return;
  }

  // Scopes define the permissions your app requests
  const scopes = [
    "user-read-private",
    "user-read-email",
    // "streaming" // Not strictly needed for Embed, but doesn't hurt
  ].join(" ");

  // Correct Spotify Authorize URL
  // Example of hardcoding (generally not recommended but functional)
  const clientId = "7d96f4a1753c4d679344bdd7e90bdd89"; // Your ID
  const authUrl = `https://api.spotify.com/v1/recommendations?limit=5&seed_genres=$5${clientId}&redirect_uri=${encodeURIComponent(
    SPOTIFY_REDIRECT_URI
  )}&scope=${encodeURIComponent(scopes)}&response_type=token&show_dialog=true`;

  // Inform the user ONLY if not already showing the message
  const messages = chatContainer.querySelectorAll(".message.other");
  const lastMessageText =
    messages.length > 0 ? messages[messages.length - 1].textContent : "";
  if (!lastMessageText.includes("connect to Spotify first")) {
    receiveMessage({
      text: "I need to connect to Spotify first. Please log in via the popup window.",
    });
  }

  // Open the Spotify login page in a popup window
  const spotifyWindow = window.open(
    authUrl,
    "Spotify Login",
    "width=500,height=650,menubar=no,location=no,resizable=yes,scrollbars=yes,status=no"
  );

  // Check if the popup was blocked
  setTimeout(() => {
    if (
      !spotifyWindow ||
      spotifyWindow.closed ||
      typeof spotifyWindow.closed === "undefined"
    ) {
      // Avoid duplicate messages if already shown
      if (!lastMessageText.includes("popup was blocked")) {
        receiveMessage({
          text: "It seems the Spotify login popup was blocked by your browser. Please allow popups for this site and try the command again.",
        });
      }
      hideApiProcessingIndicator(); // Hide indicator as auth failed
      pendingSpotifyRequest = null; // Clear pending request
    }
  }, 1500); // Check after 1.5 seconds
}

// --- Handle Callback and Local Storage ---

// Listen for messages from the Spotify auth callback popup
window.addEventListener(
  "message",
  function (event) {
    // Security check: Ensure the message comes from the expected origin (your own)
    if (event.origin !== window.location.origin) {
      console.warn(
        "Ignored message from unexpected origin:",
        event.origin,
        "Expected:",
        window.location.origin
      );
      return;
    }

    if (event.data && event.data.type === "spotify-auth-success") {
      console.log("Received Spotify token via postMessage from callback.");
      spotifyAccessToken = event.data.token;
      // Optionally handle token expiration if 'expires_in' is sent
      // const expiresIn = event.data.expires_in;
      // if (expiresIn) {
      //     const expiryTime = new Date().getTime() + expiresIn * 1000;
      //     localStorage.setItem('spotify_token_expiry', expiryTime);
      // }

      receiveMessage({
        text: "Successfully connected to Spotify!",
      });

      // *** Execute the pending request if one exists ***
      if (typeof pendingSpotifyRequest === "function") {
        console.log("Executing pending Spotify request...");
        pendingSpotifyRequest();
        pendingSpotifyRequest = null; // Clear the pending request
      } else {
        hideApiProcessingIndicator(); // Hide indicator if no pending request
      }
    } else if (event.data && event.data.type === "spotify-auth-error") {
      console.error(
        "Received Spotify auth error via postMessage:",
        event.data.error
      );
      receiveMessage({
        text: `Spotify connection failed: ${event.data.error}. Please try again.`,
      });
      pendingSpotifyRequest = null; // Clear pending request on error
      hideApiProcessingIndicator(); // Hide indicator on error
    }
  },
  false
);

// Save message to local storage, associated with the current user
function saveMessage(message) {
  if (!currentUser) return; // Don't save if no user is logged in
  const userMessagesKey = `chatMessages_${currentUser}`;
  try {
    const messages = JSON.parse(localStorage.getItem(userMessagesKey)) || [];
    messages.push(message);
    // Limit stored messages to avoid excessive storage use (e.g., last 50)
    if (messages.length > 50) {
      messages.shift();
    }
    localStorage.setItem(userMessagesKey, JSON.stringify(messages));
  } catch (e) {
    console.error("Error saving message to localStorage:", e);
    // Maybe clear localStorage if it's corrupted?
    // localStorage.removeItem(userMessagesKey);
  }
}

// Load messages from local storage for the current user
function loadMessages() {
  if (!currentUser) return;
  const userMessagesKey = `chatMessages_${currentUser}`;
  let messages = [];
  try {
    messages = JSON.parse(localStorage.getItem(userMessagesKey)) || [];
  } catch (e) {
    console.error("Error parsing messages from localStorage:", e);
    localStorage.removeItem(userMessagesKey); // Clear corrupted data
  }

  // Clear existing messages and indicators before loading
  chatContainer.innerHTML = "";
  chatContainer.appendChild(typingIndicator); // Re-add indicators
  chatContainer.appendChild(apiProcessingIndicator);

  messages.forEach((message) => {
    // Ensure message format is somewhat valid before appending
    if (message && message.user && message.text && message.timestamp) {
      appendMessageToChat(message); // Use append function to create elements
    } else {
      console.warn("Skipping invalid message from localStorage:", message);
    }
  });

  // Scroll to the bottom after loading messages
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// --- Initialization ---

// No need for handleSpotifyCallback here anymore, the callback.html handles it.

// Optional: Load liked songs from localStorage on login?
// function loadLikedSongs() {
//     if (!currentUser) return;
//     const likedSongs = localStorage.getItem(`spotifyLikedSongs_${currentUser}`);
//     if (likedSongs) {
//         userLikedSongs = JSON.parse(likedSongs);
//         console.log("Loaded liked songs from localStorage:", userLikedSongs);
//     }
// }
// // Call loadLikedSongs() within login() function.
