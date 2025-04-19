const chatContainer = document.getElementById("chat-container");
const messageInput = document.getElementById("message-input");
const typingIndicator = document.getElementById("typing-indicator");
const apiProcessingIndicator = document.getElementById(
  "api-processing-indicator"
);
const loginContainer = document.getElementById("login-container");
const chatApp = document.getElementById("chat-app");
const usernameInput = document.getElementById("username-input");

let typingTimeout;
let currentUser;

// Gemini API Key
const GEMINI_API_KEY = "AIzaSyCVFniEjNZt74EGIrUfehhmtplfuiOYLGk";
const GEMINI_MODEL = "gemini-2.0-flash";

// Spotify API Credentials
// Note: These would typically be handled securely in a backend service
const SPOTIFY_CLIENT_ID = "7d96f4a1753c4d679344bdd7e90bdd89"; // Replace with your actual client ID
const SPOTIFY_REDIRECT_URI = window.location.origin;
let spotifyAccessToken = null;
let spotifyUserID = null;
let userLikedSongs = [];

// Fallback responses in case the API call fails
const prebuiltReplies = [
  "I can help you find music you'll love! Tell me what you're in the mood for.",
  "Looking for some new tunes? Just let me know your preferences.",
  "What kind of music are you into? I can suggest some tracks.",
  "I can recommend songs based on your music taste. What do you like?",
  "Tell me about your favorite artists, and I'll find similar music for you.",
];

// Bot introduction message
const botIntroduction =
  "Hi! I'm your music recommendation assistant. I can help you discover new music and play songs right in our chat. Try asking me to find songs by an artist, genre, or mood. You can also tell me what you like, and I'll recommend similar tracks!";

function handleLoginKey(event) {
  if (event.key === "Enter") {
    login();
  }
}

function handleTyping(event) {
  if (event.key === "Enter") {
    sendMessage();
    return;
  }
  showTypingIndicator();
}

function showTypingIndicator() {
  typingIndicator.classList.add("active");
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    typingIndicator.classList.remove("active");
  }, 2000);
}

function sendMessage() {
  const messageText = messageInput.value.trim();
  if (messageText === "") return;

  console.log("Sending message:", messageText);

  const timestamp = formatTimestamp(new Date());
  const message = {
    user: currentUser,
    text: messageText,
    timestamp: timestamp,
    avatar: "EmptyProfilePic.webp",
  };

  // Save message to local storage
  saveMessage(message);

  // Create message element
  const messageElement = createMessageElement(message);

  // Append message to chat container
  chatContainer.appendChild(messageElement);

  // Scroll to bottom
  chatContainer.scrollTop = chatContainer.scrollHeight;

  // Clear input field
  messageInput.value = "";

  // Process the message for music-related commands
  processMusicCommand(messageText);
}

function processMusicCommand(userMessage) {
  // Show API processing indicator
  apiProcessingIndicator.classList.add("active");

  // Check for common music commands
  const lowerCaseMessage = userMessage.toLowerCase();

  if (
    lowerCaseMessage.includes("play") &&
    (lowerCaseMessage.includes("song") ||
      lowerCaseMessage.includes("track") ||
      lowerCaseMessage.includes("music"))
  ) {
    // Extract song/artist details after "play"
    const searchQuery = userMessage
      .substring(userMessage.toLowerCase().indexOf("play") + 5)
      .trim();
    searchAndDisplaySongs(searchQuery);
    return;
  }

  if (
    lowerCaseMessage.includes("recommend") ||
    lowerCaseMessage.includes("suggestion") ||
    lowerCaseMessage.includes("similar to")
  ) {
    // Handle recommendation request
    getRecommendationsBasedOnMessage(userMessage);
    return;
  }

  if (
    lowerCaseMessage.includes("i like") ||
    lowerCaseMessage.includes("favorite") ||
    lowerCaseMessage.includes("love the song")
  ) {
    // User is indicating a preference
    addToUserPreferences(userMessage);
    return;
  }

  // Default to Gemini for general conversations
  getGeminiResponse(userMessage);
}

function searchAndDisplaySongs(query) {
  if (!spotifyAccessToken) {
    authenticateWithSpotify();
    return;
  }

  // Call Spotify search API
  fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(
      query
    )}&type=track&limit=5`,
    {
      headers: {
        Authorization: `Bearer ${spotifyAccessToken}`,
      },
    }
  )
    .then((response) => {
      if (!response.ok) {
        if (response.status === 401) {
          // Token expired, refresh and try again
          authenticateWithSpotify();
          throw new Error("Authentication needed");
        }
        throw new Error("Spotify API error");
      }
      return response.json();
    })
    .then((data) => {
      if (data.tracks && data.tracks.items && data.tracks.items.length > 0) {
        displaySongResults(data.tracks.items);
      } else {
        const message = {
          user: "AI",
          text: "I couldn't find any songs matching your request. Try a different search term.",
          timestamp: formatTimestamp(new Date()),
          avatar: "chatbot_profile.png",
        };
        receiveMessage(message);
      }
    })
    .catch((error) => {
      console.error("Error searching Spotify:", error);
      const message = {
        user: "AI",
        text: "I'm having trouble connecting to Spotify right now. Please try again later.",
        timestamp: formatTimestamp(new Date()),
        avatar: "chatbot_profile.png",
      };
      receiveMessage(message);
    })
    .finally(() => {
      hideApiProcessingIndicator();
    });
}

function displaySongResults(tracks) {
  let songListHTML = "<div class='song-results'>";

  tracks.forEach((track) => {
    const artists = track.artists.map((artist) => artist.name).join(", ");
    const trackId = track.id;
    const trackName = track.name;
    const albumImage =
      track.album.images.length > 0
        ? track.album.images[2].url
        : "default_album.png";

    songListHTML += `
      <div class='song-item' data-track-id='${trackId}'>
        <img src='${albumImage}' alt='${trackName}' class='song-thumbnail'>
        <div class='song-details'>
          <div class='song-title'>${trackName}</div>
          <div class='song-artist'>${artists}</div>
        </div>
        <button class='play-button' onclick='playSong("${trackId}", "${trackName.replace(
      /"/g,
      '\\"'
    )}", "${artists.replace(/"/g, '\\"')}")'>▶</button>
      </div>
    `;
  });

  songListHTML += "</div>";

  const message = {
    user: "AI",
    text: `Here are some songs I found: ${songListHTML}`,
    timestamp: formatTimestamp(new Date()),
    avatar: "chatbot_profile.png",
    isHTML: true,
  };

  receiveMessage(message);
}

function playSong(trackId, trackName, artists) {
  const playerHTML = `
    <div class='spotify-player'>
      <iframe src="https://open.spotify.com/embed/track/${trackId}" 
        width="100%" height="80" frameborder="0" allowtransparency="true" 
        allow="encrypted-media"></iframe>
    </div>
  `;

  const message = {
    user: "AI",
    text: `Now playing: ${trackName} by ${artists} ${playerHTML}`,
    timestamp: formatTimestamp(new Date()),
    avatar: "chatbot_profile.png",
    isHTML: true,
  };

  receiveMessage(message);

  // Add to user's liked songs for later recommendations
  userLikedSongs.push(trackId);
  if (userLikedSongs.length > 10) {
    userLikedSongs.shift(); // Keep only the 10 most recent songs
  }
}

function getRecommendationsBasedOnMessage(userMessage) {
  if (!spotifyAccessToken) {
    authenticateWithSpotify();
    return;
  }

  // First try to get recommendations based on the user's liked songs
  if (userLikedSongs.length > 0) {
    getSpotifyRecommendations(userLikedSongs.slice(-5)); // Use the last 5 liked tracks
    return;
  }

  // If no liked songs, extract possible genres or artists from message
  const lowerCaseMessage = userMessage.toLowerCase();
  let seedArtists = [];
  let seedGenres = [];

  // Simple extraction of potential artist or genre names
  const commonGenres = [
    "rock",
    "pop",
    "hip hop",
    "rap",
    "jazz",
    "classical",
    "country",
    "electronic",
    "dance",
    "r&b",
    "indie",
  ];
  commonGenres.forEach((genre) => {
    if (lowerCaseMessage.includes(genre)) {
      seedGenres.push(genre);
    }
  });

  // Extract potential artist names (this is a simplified approach)
  const artistKeywords = ["by", "like", "similar to", "such as"];
  artistKeywords.forEach((keyword) => {
    const keywordIndex = lowerCaseMessage.indexOf(keyword);
    if (keywordIndex !== -1) {
      const potentialArtist = lowerCaseMessage
        .substring(keywordIndex + keyword.length)
        .trim();
      if (potentialArtist) {
        // Search for the artist
        searchArtistAndGetRecommendations(potentialArtist);
        return;
      }
    }
  });

  // If we have some seed genres, use those
  if (seedGenres.length > 0) {
    getSpotifyRecommendationsByGenre(seedGenres);
    return;
  }

  // Default to asking Gemini for help
  const promptForRecommendation = `The user is looking for music recommendations. They said: "${userMessage}". Give a very short response (max 2 sentences) suggesting a specific genre or artist they might like based on their message. Don't use markdown formatting.`;
  getGeminiResponse(promptForRecommendation, true);
}

function searchArtistAndGetRecommendations(artistName) {
  fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(
      artistName
    )}&type=artist&limit=1`,
    {
      headers: {
        Authorization: `Bearer ${spotifyAccessToken}`,
      },
    }
  )
    .then((response) => response.json())
    .then((data) => {
      if (data.artists && data.artists.items && data.artists.items.length > 0) {
        const artistId = data.artists.items[0].id;
        getSpotifyRecommendationsByArtist(artistId);
      } else {
        // Fall back to Gemini
        const promptForRecommendation = `The user is looking for music recommendations similar to ${artistName}. Give a very short response (max 2 sentences) suggesting they try another similar artist. Don't use markdown formatting.`;
        getGeminiResponse(promptForRecommendation, true);
      }
    })
    .catch((error) => {
      console.error("Error searching artist:", error);
      hideApiProcessingIndicator();
      const message = {
        user: "AI",
        text: "I'm having trouble finding that artist. Can you try another one?",
        timestamp: formatTimestamp(new Date()),
        avatar: "chatbot_profile.png",
      };
      receiveMessage(message);
    });
}

function getSpotifyRecommendations(seedTracks) {
  fetch(
    `https://api.spotify.com/v1/recommendations?limit=5&seed_tracks=${seedTracks.join(
      ","
    )}`,
    {
      headers: {
        Authorization: `Bearer ${spotifyAccessToken}`,
      },
    }
  )
    .then((response) => response.json())
    .then((data) => {
      if (data.tracks && data.tracks.length > 0) {
        displaySongResults(data.tracks);
      } else {
        const message = {
          user: "AI",
          text: "I couldn't find any recommendations based on your liked songs. Let's try something else!",
          timestamp: formatTimestamp(new Date()),
          avatar: "chatbot_profile.png",
        };
        receiveMessage(message);
      }
    })
    .catch((error) => {
      console.error("Error getting recommendations:", error);
      hideApiProcessingIndicator();
      const message = {
        user: "AI",
        text: "I'm having trouble getting recommendations right now. Please try again later.",
        timestamp: formatTimestamp(new Date()),
        avatar: "chatbot_profile.png",
      };
      receiveMessage(message);
    });
}

function getSpotifyRecommendationsByGenre(genres) {
  fetch(
    `https://api.spotify.com/v1/recommendations?limit=5&seed_genres=${genres
      .slice(0, 5)
      .join(",")}`,
    {
      headers: {
        Authorization: `Bearer ${spotifyAccessToken}`,
      },
    }
  )
    .then((response) => response.json())
    .then((data) => {
      if (data.tracks && data.tracks.length > 0) {
        displaySongResults(data.tracks);
      } else {
        const message = {
          user: "AI",
          text: "I couldn't find any recommendations based on those genres. Let's try something else!",
          timestamp: formatTimestamp(new Date()),
          avatar: "chatbot_profile.png",
        };
        receiveMessage(message);
      }
    })
    .catch((error) => {
      console.error("Error getting genre recommendations:", error);
      hideApiProcessingIndicator();
      const message = {
        user: "AI",
        text: "I'm having trouble finding recommendations for that genre. Can you try another one?",
        timestamp: formatTimestamp(new Date()),
        avatar: "chatbot_profile.png",
      };
      receiveMessage(message);
    });
}

function getSpotifyRecommendationsByArtist(artistId) {
  fetch(
    `https://api.spotify.com/v1/recommendations?limit=5&seed_artists=${artistId}`,
    {
      headers: {
        Authorization: `Bearer ${spotifyAccessToken}`,
      },
    }
  )
    .then((response) => response.json())
    .then((data) => {
      if (data.tracks && data.tracks.length > 0) {
        displaySongResults(data.tracks);
      } else {
        const message = {
          user: "AI",
          text: "I couldn't find any recommendations similar to that artist. Let's try something else!",
          timestamp: formatTimestamp(new Date()),
          avatar: "chatbot_profile.png",
        };
        receiveMessage(message);
      }
    })
    .catch((error) => {
      console.error("Error getting artist recommendations:", error);
      hideApiProcessingIndicator();
      const message = {
        user: "AI",
        text: "I'm having trouble finding recommendations for that artist. Can you try another one?",
        timestamp: formatTimestamp(new Date()),
        avatar: "chatbot_profile.png",
      };
      receiveMessage(message);
    });
}

function addToUserPreferences(userMessage) {
  // This function handles when a user says they like something
  const aiMessage = {
    user: "AI",
    text: "I've noted that you like that! I'll use it to improve my recommendations for you.",
    timestamp: formatTimestamp(new Date()),
    avatar: "chatbot_profile.png",
  };
  receiveMessage(aiMessage);

  // Extract potential song or artist from message
  const lowerCaseMessage = userMessage.toLowerCase();
  let potentialSong = "";

  // Common patterns to extract song/artist info
  if (lowerCaseMessage.includes("i like")) {
    potentialSong = userMessage
      .substring(lowerCaseMessage.indexOf("i like") + 7)
      .trim();
  } else if (lowerCaseMessage.includes("favorite")) {
    // Find content after "favorite" and before any common endpoints
    potentialSong = userMessage
      .substring(lowerCaseMessage.indexOf("favorite") + 8)
      .trim();
  } else if (lowerCaseMessage.includes("love the song")) {
    potentialSong = userMessage
      .substring(lowerCaseMessage.indexOf("love the song") + 14)
      .trim();
  }

  if (potentialSong) {
    // Search for the song and add it to user preferences
    searchAndAddToPreferences(potentialSong);
  }
}

function searchAndAddToPreferences(query) {
  if (!spotifyAccessToken) {
    authenticateWithSpotify();
    return;
  }

  fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(
      query
    )}&type=track&limit=1`,
    {
      headers: {
        Authorization: `Bearer ${spotifyAccessToken}`,
      },
    }
  )
    .then((response) => response.json())
    .then((data) => {
      if (data.tracks && data.tracks.items && data.tracks.items.length > 0) {
        const track = data.tracks.items[0];
        userLikedSongs.push(track.id);
        if (userLikedSongs.length > 10) {
          userLikedSongs.shift(); // Keep only the 10 most recent songs
        }

        const message = {
          user: "AI",
          text: `Great! I've added "${track.name}" by ${track.artists[0].name} to your preferences. Would you like to hear similar songs?`,
          timestamp: formatTimestamp(new Date()),
          avatar: "chatbot_profile.png",
        };
        receiveMessage(message);
      }
    })
    .catch((error) => {
      console.error("Error searching for song preference:", error);
    });
}

function getGeminiResponse(userMessage, isForRecommendation = false) {
  // Show API processing indicator
  apiProcessingIndicator.classList.add("active");

  // Prepare the API request
  const apiUrl = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  // Add music-focused system prompt if this is for a recommendation
  let promptText = userMessage;
  if (isForRecommendation) {
    promptText = `You are a music recommendation assistant. ${userMessage} Keep your response very brief, simple, and conversational. Avoid using markdown formatting. Don't use bullet points. Limit response to 2-3 sentences maximum.`;
  } else {
    promptText = `You are a music recommendation assistant helping a user find songs they might like. The user said: "${userMessage}". Keep your response very brief, simple, and conversational. Avoid using markdown formatting. Don't use bullet points. Limit response to 2-3 sentences maximum. If they're looking for music recommendations, suggest they ask for specific genres or artists. If they greet you or ask what you can do, tell them you can help find music and play songs.`;
  }

  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: promptText,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 100, // Limit the length of the response
    },
  };

  // Call the Gemini API
  fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response.json();
    })
    .then((data) => {
      // Extract the generated text from the response
      const generatedText = data.candidates[0].content.parts[0].text;

      // Strip any markdown formatting
      let cleanedText = generatedText
        .replace(/\*\*(.*?)\*\*/g, "$1") // Remove bold
        .replace(/\*(.*?)\*/g, "$1") // Remove italics
        .replace(/^#+\s+/gm, "") // Remove headers
        .replace(/^[-*]\s+/gm, "") // Remove bullet points
        .replace(/\n\n/g, " ") // Replace double newlines
        .replace(/\n/g, " ")
        .trim(); // Replace single newlines

      // Ensure response isn't too long
      if (cleanedText.length > 150) {
        cleanedText = cleanedText.substring(0, 150) + "...";
      }

      // Create and display the AI message
      const message = {
        user: "AI",
        text: cleanedText,
        timestamp: formatTimestamp(new Date()),
        avatar: "chatbot_profile.png",
      };
      receiveMessage(message);
    })
    .catch((error) => {
      console.error("Error calling Gemini API:", error);
      // Fall back to prebuilt replies if API fails
      const randomReply =
        prebuiltReplies[Math.floor(Math.random() * prebuiltReplies.length)];
      const message = {
        user: "AI",
        text: randomReply,
        timestamp: formatTimestamp(new Date()),
        avatar: "chatbot_profile.png",
      };
      receiveMessage(message);
    })
    .finally(() => {
      hideApiProcessingIndicator();
    });
}

function authenticateWithSpotify() {
  // In a real app, you'd use proper OAuth, but for this demo we'll use a simplified approach
  // This will open the Spotify login page in a new window
  const scopes =
    "user-read-private user-read-email streaming user-library-read user-top-read";
  const authUrl = `https://accounts.spotify.com/authorize?client_id=${SPOTIFY_CLIENT_ID}&redirect_uri=${encodeURIComponent(
    SPOTIFY_REDIRECT_URI
  )}&scope=${encodeURIComponent(scopes)}&response_type=token`;

  const spotifyWindow = window.open(
    authUrl,
    "Spotify Login",
    "width=800,height=600"
  );

  // Message to user
  const message = {
    user: "AI",
    text: "To provide music recommendations, I need you to login to your Spotify account. A login window has opened. Please complete the authentication process.",
    timestamp: formatTimestamp(new Date()),
    avatar: "chatbot_profile.png",
  };
  receiveMessage(message);

  // Listen for callback with the token
  window.addEventListener("message", function (event) {
    if (event.data.type === "spotify-token") {
      spotifyAccessToken = event.data.token;
      spotifyWindow.close();

      // Message after successful authentication
      const successMessage = {
        user: "AI",
        text: "Thanks for logging in! Now I can help you find and play music. Try asking for a song or artist you like!",
        timestamp: formatTimestamp(new Date()),
        avatar: "chatbot_profile.png",
      };
      receiveMessage(successMessage);
    }
  });
}

function receiveMessage(message) {
  console.log("Received message:", message.text);

  // Save message to local storage
  saveMessage(message);

  const messageElement = createMessageElement(message);

  chatContainer.appendChild(messageElement);
  chatContainer.scrollTop = chatContainer.scrollHeight;

  // Hide typing indicator after receiving message
  hideApiProcessingIndicator();
}

function formatTimestamp(date) {
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  const strTime =
    hours + ":" + (minutes < 10 ? "0" + minutes : minutes) + " " + ampm;
  return strTime;
}

function login() {
  const username = usernameInput.value.trim();
  if (username === "") return;

  currentUser = username;
  loginContainer.style.display = "none";
  chatApp.style.display = "flex";

  console.log("User logged in as:", username);

  // Load messages from local storage
  loadMessages();

  // Send introduction message
  setTimeout(() => {
    const introMessage = {
      user: "AI",
      text: botIntroduction,
      timestamp: formatTimestamp(new Date()),
      avatar: "chatbot_profile.png",
    };
    receiveMessage(introMessage);
  }, 1000);
}

function createMessageElement(message) {
  const messageElement = document.createElement("div");
  messageElement.classList.add(
    "message",
    message.user === currentUser ? "user" : "other"
  );

  // Handle HTML content (for song results and players)
  if (message.isHTML) {
    messageElement.innerHTML = `
      <img src="${
        message.avatar || "EmptyProfilePic.webp"
      }" class="avatar" alt="User Avatar">
      <div>
        <div>${message.text}</div>
        <div class="timestamp">${message.timestamp}</div>
      </div>
    `;
  } else {
    messageElement.innerHTML = `
      <img src="${
        message.avatar || "EmptyProfilePic.webp"
      }" class="avatar" alt="User Avatar">
      <div>
        <div>${message.text}</div>
        <div class="timestamp">${message.timestamp}</div>
      </div>
    `;
  }

  return messageElement;
}

function saveMessage(message) {
  const messages = JSON.parse(localStorage.getItem("messages")) || [];
  messages.push(message);
  localStorage.setItem("messages", JSON.stringify(messages));
}

function loadMessages() {
  const messages = JSON.parse(localStorage.getItem("messages")) || [];
  messages.forEach((message) => {
    const messageElement = createMessageElement(message);
    chatContainer.appendChild(messageElement);
  });
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function hideApiProcessingIndicator() {
  apiProcessingIndicator.classList.remove("active");
}

// Handle Spotify OAuth redirect
window.addEventListener("load", function () {
  const hashParams = window.location.hash
    .substring(1)
    .split("&")
    .reduce((acc, item) => {
      const parts = item.split("=");
      acc[parts[0]] = decodeURIComponent(parts[1]);
      return acc;
    }, {});

  if (hashParams.access_token) {
    // We're in the callback page
    window.opener.postMessage(
      { type: "spotify-token", token: hashParams.access_token },
      "*"
    );
    window.close();
  }
});
