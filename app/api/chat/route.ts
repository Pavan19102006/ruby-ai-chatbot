import Groq from 'groq-sdk';

interface MessageContent {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string | MessageContent[];
  image?: string;
}

export async function POST(req: Request) {
  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const { messages, model: requestedModel } = await req.json();

    const hasImage = messages.some((msg: ChatMessage) => msg.image);

    const formattedMessages = messages.map((msg: ChatMessage) => {
      if (msg.image) {
        return {
          role: msg.role,
          content: [
            { type: 'text', text: msg.content as string },
            { type: 'image_url', image_url: { url: msg.image } },
          ],
        };
      }
      return { role: msg.role, content: msg.content };
    });

    // Use requested model or default
    const model = requestedModel || 'meta-llama/llama-4-maverick-17b-128e-instruct';

    const systemMessage = {
      role: 'system',
      content: `You are Ruby, a helpful AI assistant. Guidelines:
- Be concise and direct
- For coding questions: provide code solution first, then brief explanations
- Use markdown with proper code blocks (\`\`\`language)
- Be friendly but efficient`,
    };

    const completion = await groq.chat.completions.create({
      model,
      messages: [systemMessage, ...formattedMessages],
      temperature: 0.7,
      max_tokens: 4096,
      stream: true,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of completion) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Failed to generate response' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
