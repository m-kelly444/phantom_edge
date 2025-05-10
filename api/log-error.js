// /api/log-error.js

export default async function handler(req, res) {
    if (req.method === 'POST') {
        const body = await req.json();

        console.error('[Client Error]', JSON.stringify(body, null, 2)); // This appears in Vercel logs

        return res.status(200).json({ status: 'logged' });
    } else {
        return res.status(405).json({ error: 'Method not allowed' });
    }
}
