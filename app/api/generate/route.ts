import { NextRequest, NextResponse } from 'next/server';

interface GenerationRequest {
    prompt: string;
    type: 'image' | 'video';
    aspectRatio?: string;
    resolution?: string;
}

// Generate image using Nano Banana Pro
async function generateImage(prompt: string, aspectRatio: string, resolution: string) {
    const response = await fetch('https://api.mulerouter.ai/vendors/google/v1/nano-banana-pro/generation', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.QWEN_API_KEY}`,
        },
        body: JSON.stringify({
            prompt,
            aspect_ratio: aspectRatio || '1:1',
            resolution: resolution || '2K',
        }),
    });
    return response;
}

// Generate video using Wan2
async function generateVideo(prompt: string) {
    const response = await fetch('https://api.mulerouter.ai/vendors/alibaba/v1/wan2/t2v/generation', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.QWEN_API_KEY}`,
        },
        body: JSON.stringify({
            prompt,
            width: 1280,
            height: 720,
        }),
    });
    return response;
}

// Check task status
async function checkTaskStatus(taskId: string, type: 'image' | 'video') {
    const endpoint = type === 'image'
        ? `https://api.mulerouter.ai/vendors/google/v1/nano-banana-pro/generation/${taskId}`
        : `https://api.mulerouter.ai/vendors/alibaba/v1/wan2/t2v/generation/${taskId}`;

    const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${process.env.QWEN_API_KEY}`,
        },
    });
    return response;
}

export async function POST(req: NextRequest) {
    try {
        const { prompt, type, aspectRatio, resolution }: GenerationRequest = await req.json();

        if (!prompt) {
            return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
        }

        let response;
        if (type === 'image') {
            response = await generateImage(prompt, aspectRatio || '1:1', resolution || '2K');
        } else if (type === 'video') {
            response = await generateVideo(prompt);
        } else {
            return NextResponse.json({ error: 'Invalid type. Use "image" or "video"' }, { status: 400 });
        }

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Generation error:', errorText);
            return NextResponse.json({ error: `Generation failed: ${response.status}` }, { status: response.status });
        }

        const data = await response.json();

        // Return task info for polling
        return NextResponse.json({
            success: true,
            taskId: data.task_info?.task_id || data.id,
            status: data.task_info?.status || 'processing',
            type,
        });
    } catch (error) {
        console.error('Generation error:', error);
        return NextResponse.json({ error: 'Failed to generate' }, { status: 500 });
    }
}

// GET endpoint for checking task status
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const taskId = searchParams.get('taskId');
        const type = searchParams.get('type') as 'image' | 'video';

        if (!taskId || !type) {
            return NextResponse.json({ error: 'taskId and type are required' }, { status: 400 });
        }

        const response = await checkTaskStatus(taskId, type);

        if (!response.ok) {
            return NextResponse.json({ error: 'Failed to check status' }, { status: response.status });
        }

        const data = await response.json();

        return NextResponse.json({
            status: data.task_info?.status || data.status,
            result: data.task_info?.result || data.result,
            url: data.task_info?.result?.url || data.url,
        });
    } catch (error) {
        console.error('Status check error:', error);
        return NextResponse.json({ error: 'Failed to check status' }, { status: 500 });
    }
}
