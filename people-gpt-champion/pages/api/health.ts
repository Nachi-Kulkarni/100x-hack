import type { NextApiRequest, NextApiResponse } from 'next';

type HealthResponse = {
  status: string;
  timestamp: number;
  node_version: string;
  platform: string;
  memory_usage: NodeJS.MemoryUsage;
};

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<HealthResponse | { error: string }>
) {
  if (req.method === 'GET') {
    res.status(200).json({
      status: 'ok',
      timestamp: Date.now(),
      node_version: process.version,
      platform: process.platform,
      memory_usage: process.memoryUsage(),
    });
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }
}
