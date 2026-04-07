const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve the single index.html page when users visit the root URL
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// The secure endpoint your frontend will call
app.post('/api/convert', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: "No URL provided" });
    }

    try {
        const response = await fetch('https://api.cobalt.tools/api/json', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                url: url,
                downloadMode: 'audio',
                audioFormat: 'mp3'
            })
        });

        const data = await response.json();
        res.json(data);

    } catch (error) {
        console.error("Server error:", error);
        res.status(500).json({ error: "Failed to process the request" });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});