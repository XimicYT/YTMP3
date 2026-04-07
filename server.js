const express = require('express');
const cors = require('cors');
const path = require('path');
const { Innertube, UniversalCache } = require('youtubei.js');
const youtubedl = require('youtube-dl-exec'); // The new bulletproof engine

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve the frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

let yt;

// PLAYLIST ROUTE: Grabs the titles cleanly
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

// DOWNLOAD ROUTE: Uses yt-dlp to bypass bot protection
app.get('/api/download', async (req, res) => {
    const videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).send("No URL provided");

    try {
        // Grab the title using our InnerTube instance
        if (!yt) yt = await Innertube.create({ cache: new UniversalCache(false) });
        
        const videoIdMatch = videoUrl.match(/(?:v=|\/)([0-9A-Za-z_-]{11}).*/);
        const videoId = videoIdMatch ? videoIdMatch[1] : null;

        if (!videoId) return res.status(400).send("Could not extract a valid YouTube Video ID.");

        const info = await yt.getBasicInfo(videoId);
        const safeTitle = info.basic_info.title.replace(/[^\w\s-]/gi, '').trim();

        // Tell the browser a file is incoming
        res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.m4a"`);
        res.setHeader('Content-Type', 'audio/mp4');

        // Execute yt-dlp and pipe the audio straight to the user
        const subprocess = youtubedl.exec(videoUrl, {
            format: 'bestaudio[ext=m4a]', 
            output: '-' 
        });

        subprocess.stdout.pipe(res);

        subprocess.stderr.on('data', (data) => {
            console.error(`yt-dlp logs: ${data}`);
        });

    } catch (error) {
        console.error("Server error:", error);
        if (!res.headersSent) {
            res.status(500).send(`Failed to process download. Reason: ${error.message}`);
        }
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});