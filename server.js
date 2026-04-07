const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs'); // Built-in Node tool to interact with the hard drive
const { Innertube, UniversalCache } = require('youtubei.js');
const youtubedl = require('youtube-dl-exec');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve the frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

let yt;

// PLAYLIST ROUTE (Remains unchanged, as it works perfectly)
app.get('/api/playlist', async (req, res) => {
    const playlistUrl = req.query.url;
    if (!playlistUrl) return res.status(400).json({ error: "No URL provided" });

    try {
        if (!yt) yt = await Innertube.create({ cache: new UniversalCache(false) });

        const urlParams = new URLSearchParams(playlistUrl.split('?')[1]);
        const playlistId = urlParams.get('list');
        if (!playlistId) return res.status(400).json({ error: "Could not find a 'list=' parameter in the URL." });

        const playlist = await yt.getPlaylist(playlistId);
        
        const videos = playlist.videos.map(video => ({
            id: video.id,
            title: video.title.text
        }));

        res.json({ playlistTitle: playlist.info.title, total: videos.length, videos: videos });

    } catch (error) {
        console.error("Playlist error:", error);
        res.status(500).json({ error: "Could not fetch playlist. It might be private." });
    }
});

// DOWNLOAD ROUTE: Disk-First Architecture
app.get('/api/download', async (req, res) => {
    const videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).send("No URL provided");

    // 1. Extract ID and set up a temporary file path on the server
    const videoIdMatch = videoUrl.match(/(?:v=|\/)([0-9A-Za-z_-]{11}).*/);
    const videoId = videoIdMatch ? videoIdMatch[1] : `audio_${Date.now()}`;
    const tempFilePath = path.join(__dirname, `${videoId}.m4a`);

    try {
        console.log(`Starting download for ${videoId} to server disk...`);

        // 2. FORCE YT-DLP TO DOWNLOAD TO DISK FIRST
        // We use 'await' so the server stops and waits for the entire download to finish
        await youtubedl(videoUrl, {
            format: '140', // Native YouTube Audio
            output: tempFilePath, // Save to the temporary file path
            'extractor-args': 'youtube:player_client=android,web', // Spoof mobile client to bypass 403s
            'no-warnings': true,
            'no-playlist': true
        });

        console.log(`Download complete on server! Sending to user...`);

        // 3. SEND THE GUARANTEED FILE TO THE BROWSER
        res.download(tempFilePath, `audio_${videoId}.m4a`, (err) => {
            if (err) {
                console.error("Browser disconnected before finishing:", err);
            }
            
            // 4. CLEANUP: Delete the file from the server immediately after sending
            if (fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath);
                console.log(`Cleaned up temporary file: ${tempFilePath}`);
            }
        });

    } catch (error) {
        console.error("yt-dlp completely failed:", error.message);
        
        // Cleanup just in case a broken, partial file was created
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }
        
        // Because we haven't sent ANY fake headers yet, we can safely send the actual error!
        if (!res.headersSent) {
            res.status(500).send(`YouTube rejected the server's request. Error Log: ${error.message}`);
        }
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});