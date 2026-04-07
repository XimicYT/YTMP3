// NEW ROUTE: Fetch Playlist Data
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