import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ 
            status: 'error', 
            message: 'Method not allowed. Only POST requests are accepted.' 
        });
    }

    try {
        const payload = req.body;
        
        console.log('Received webhook payload:');
        console.log(JSON.stringify(payload, null, 2));
        
        // Process your webhook payload here
        // Add your webhook handling logic
        
        res.status(200).json({ 
            status: 'success', 
            message: 'Webhook received and processed successfully' 
        });
    } catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'Internal server error while processing webhook' 
        });
    }
}
