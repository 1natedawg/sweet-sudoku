export default async function handler(req, res) {
    const { difficulty = 'medium' } = req.query;
    const apiKey = process.env.API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'API key is not configured on the server.' });
    }

    try {
        const apiResponse = await fetch(`https://api.api-ninjas.com/v1/sudokugenerate?difficulty=${difficulty}`, {
            headers: { 'X-Api-Key': apiKey }
        });

        const data = await apiResponse.json();

        if (!apiResponse.ok) {
            return res.status(apiResponse.status).json({ error: data.error || 'Failed to fetch from API Ninjas' });
        }

        // Return the puzzle data safely to your frontend
        return res.status(200).json(data);
    } catch (error) {
        console.error('Server proxy error:', error);
        return res.status(500).json({ error: 'Internal server error while fetching puzzle.' });
    }
}