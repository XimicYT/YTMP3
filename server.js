const express = require('express');
const cors = require('cors');
const path = require('path');
const { Innertube, UniversalCache } = require('youtubei.js');

// 1. Initialize Express first!
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 2. Serve your index.html page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// We keep a single instance of InnerTube in memory for efficiency
let yt;

// 3. ROUTE: Fetch Playlist Data
app.get('/api/playlist', async (req, res) => {
    const playlistUrl = req.query.url;

    if (!playlistUrl) return res.status(400).json({ error: "No URL provided" });

    try {
        if (!yt) {
            yt = await Innertube.create({ cache: new UniversalCache(false) });
        }

        // Extract the playlist ID (from "list=...")
        const urlParams = new URLSearchParams(playlistUrl.split('?')[1]);
        const playlistId = urlParams.get('list');

        if (!playlistId) {
            return res.status(400).json({ error: "Could not find a 'list=' parameter in the URL." });
        }

        // Fetch the playlist info from InnerTube
        const playlist = await yt.getPlaylist(playlistId);
        
        // Map over the items to extract just the IDs and Titles
        const videos = playlist.videos.map(video => ({
            id: video.id,
            title: video.title.text
        }));

        // Send the clean array back to the frontend
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

// 4. ROUTE: Download Single Audio File
app.get('/api/download', async (req, res) => {
    const videoUrl = req.query.url;

    if (!videoUrl) {
        return res.status(400).send("No URL provided");
    }

    try {
        // Initialize InnerTube if it hasn't been already
        if (!yt) {
            yt = await Innertube.create({ cache: new UniversalCache(false) });
        }

        // Extract the Video ID from the URL
        const videoIdMatch = videoUrl.match(/(?:v=|\/)([0-9A-Za-z_-]{11}).*/);
        const videoId = videoIdMatch ? videoIdMatch[1] : null;

        if (!videoId) {
            return res.status(400).send("Could not extract a valid YouTube Video ID.");
        }

        // Get basic info so we can name the downloaded file correctly
        const info = await yt.getBasicInfo(videoId);
        const safeTitle = info.basic_info.title.replace(/[^\w\s-]/gi, '').trim();

        // Request the audio stream from YouTube
        const stream = await yt.download(videoId, {
            type: 'audio',
            quality: 'best',
            format: 'mp4' 
        });

        // Tell the browser to expect a file download
        res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.m4a"`);
        res.setHeader('Content-Type', 'audio/mp4');

        // Pipe the chunks of audio from YouTube directly to the user
        for await (const chunk of stream) {
            res.write(chunk);
        }
        res.end();

    } catch (error) {
        console.error("Server error:", error);
        if (!res.headersSent) {
            res.status(500).send("Failed to process the request. The video might be private or region-locked.");
        }
    }
});

// 5. Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});