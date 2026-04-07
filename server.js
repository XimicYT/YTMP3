const express = require('express');
const cors = require('cors');
const path = require('path');
const { Innertube, UniversalCache } = require('youtubei.js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve your index.html page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// We keep a single instance of InnerTube in memory
let yt;

app.get('/api/download', async (req, res) => {
    const videoUrl = req.query.url;

    if (!videoUrl) {
        return res.status(400).send("No URL provided");
    }

    try {
        // 1. Initialize InnerTube if it hasn't been already
        if (!yt) {
            yt = await Innertube.create({ cache: new UniversalCache(false) });
        }

        // 2. Extract the Video ID from the URL
        const videoIdMatch = videoUrl.match(/(?:v=|\/)([0-9A-Za-z_-]{11}).*/);
        const videoId = videoIdMatch ? videoIdMatch[1] : null;

        if (!videoId) {
            return res.status(400).send("Could not extract a valid YouTube Video ID.");
        }

        // 3. Get basic info so we can name the downloaded file correctly
        const info = await yt.getBasicInfo(videoId);
        // Clean the title so it doesn't have weird characters that break file systems
        const safeTitle = info.basic_info.title.replace(/[^\w\s-]/gi, '').trim();

        // 4. Request the audio stream from YouTube
        const stream = await yt.download(videoId, {
            type: 'audio', // Audio only!
            quality: 'best',
            format: 'mp4'  // This gives us the standard AAC/M4A audio track
        });

        // 5. Tell the browser to expect a file download
        res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.m4a"`);
        res.setHeader('Content-Type', 'audio/mp4');

        // 6. Pipe the chunks of audio from YouTube directly to the user!
        for await (const chunk of stream) {
            res.write(chunk);
        }
        res.end(); // Done!

    } catch (error) {
        console.error("Server error:", error);
        if (!res.headersSent) {
            res.status(500).send("Failed to process the request. The video might be private or region-locked.");
        }
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});