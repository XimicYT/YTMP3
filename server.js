const express = require('express');
const cors = require('cors');
const path = require('path');
const { Innertube, UniversalCache } = require('youtubei.js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve the frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

let yt;

// 1. PLAYLIST ROUTE: Keep using youtubei.js (It works perfectly for metadata!)
app.get('/api/playlist', async (req, res) => {
    const playlistUrl = req.query.url;

    if (!playlistUrl) return res.status(400).json({ error: "No URL provided" });

    try {
        if (!yt) {
            yt = await Innertube.create({ cache: new UniversalCache(false) });
        }

        const urlParams = new URLSearchParams(playlistUrl.split('?')[1]);
        const playlistId = urlParams.get('list');

        if (!playlistId) {
            return res.status(400).json({ error: "Could not find a 'list=' parameter in the URL." });
        }

        const playlist = await yt.getPlaylist(playlistId);
        
        const videos = playlist.videos.map(video => ({
            id: video.id,
            title: video.title.text
        }));

        res.json({ 
            playlistTitle: playlist.info.title,
            total: videos.length,
            videos: videos 
        });

    } catch (error) {
        console.error("Playlist error:", error);
        res.status(500).json({ error: "Could not fetch playlist. It might be private." });
    }
});

// 2. DOWNLOAD ROUTE: Pivot to the new Cobalt v10 API
app.get('/api/download', async (req, res) => {
    const videoUrl = req.query.url;

    if (!videoUrl) {
        return res.status(400).send("No URL provided");
    }

    try {
        // The new Cobalt API uses POST requests to the root URL
        const response = await fetch('https://api.cobalt.tools/', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                url: videoUrl,
                downloadMode: 'audio', // Ask for audio only
                audioFormat: 'mp3'     // Cobalt handles the FFmpeg conversion!
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Cobalt rejected the request (Status ${response.status}): ${errText}`);
        }

        const data = await response.json();

        if (data.url) {
            // THE MAGIC TRICK: 
            // Instead of downloading it to our Render server first, we instantly redirect 
            // the user's browser to the Cobalt download link. The browser sees the 
            // file and downloads it directly!
            res.redirect(data.url);
        } else {
            res.status(500).send("Cobalt returned an unexpected response: " + (data.text || JSON.stringify(data)));
        }

    } catch (error) {
        console.error("Server error:", error);
        res.status(500).send(`Failed to process download. Reason: ${error.message}`);
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});