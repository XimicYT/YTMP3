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
// 2. DOWNLOAD ROUTE: Pivot to Community Cobalt Instances
app.get('/api/download', async (req, res) => {
    const videoUrl = req.query.url;

    if (!videoUrl) {
        return res.status(400).send("No URL provided");
    }

    // A list of community-hosted Cobalt v10 instances without JWT bot protection.
    // If one goes down, the server automatically tries the next one!
    // You can find more active instances at https://cobalt.directory/
    const cobaltInstances = [
        'https://api.cobalt.best',
        'https://cobalt.kwiatekmiki.com',
        'https://cobalt.silly.computer'
    ];

    let lastError = "";

    for (const instanceUrl of cobaltInstances) {
        try {
            console.log(`Attempting download via ${instanceUrl}...`);
            
            const response = await fetch(`${instanceUrl}/`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    url: videoUrl,
                    downloadMode: 'audio', // Ask for audio only
                    audioFormat: 'mp3'     // Convert to standard MP3
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Status ${response.status}: ${errText}`);
            }

            const data = await response.json();

            if (data.url) {
                // THE MAGIC TRICK: We got the link!
                // Instantly redirect the user's browser to the true download link.
                return res.redirect(data.url);
            } else {
                throw new Error(`Unexpected response format: ${JSON.stringify(data)}`);
            }

        } catch (error) {
            console.warn(`Instance ${instanceUrl} failed:`, error.message);
            lastError = error.message; 
            // The loop continues and tries the next URL in the array
        }
    }

    // If the loop finishes and EVERY server failed, tell the user:
    console.error("All Cobalt instances failed.");
    res.status(500).send(`Failed to process download after trying multiple backup servers. Last reason: ${lastError}`);
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});