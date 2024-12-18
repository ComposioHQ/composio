const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use('/static', express.static(path.join(__dirname, '../dist')));

app.get('/api/signed-url', async (req, res) => {
    try {
        const response = await fetch(
            `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${process.env.AGENT_ID}`,
            {
                method: 'GET',
                headers: {
                    'xi-api-key': process.env.XI_API_KEY,
                }
            }
        );

        if (!response.ok) {
            throw new Error('Failed to get signed URL');
        }

        const data = await response.json();
        res.json({ signedUrl: data.signed_url });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Failed to get signed URL' });
    }
});

//API route for getting Agent ID, used for public agents
app.get('/api/getAgentId', (req, res) => {
    const agentId = process.env.AGENT_ID;
    res.json({ 
        agentId: `${agentId}` 
    });
});

// Serve index.html for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});