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

// Qwen API call function
async function callQwenAPI(model: string, messages: ChatMessage[]) {
  const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.QWEN_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      stream: true,
      max_tokens: 4096,
    }),
  });
  return response;
}

export async function POST(req: Request) {
  try {
    const { messages, model: requestedModel, provider } = await req.json();

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

    const model = requestedModel || 'meta-llama/llama-4-maverick-17b-128e-instruct';

    const systemMessage = {
      role: 'system',
      content: `You are Ruby, a helpful AI assistant. Guidelines:
- Be concise and direct
- For coding questions: provide code solution first, then brief explanations
- Use markdown with proper code blocks (\`\`\`language)
- Be friendly but efficient`,
    };

    // Route to appropriate provider
    if (provider === 'qwen') {
      // Use Qwen API
      const response = await callQwenAPI(model, [
        { role: 'user', content: systemMessage.content } as ChatMessage,
        ...formattedMessages,
      ]);

      if (!response.ok) {
        throw new Error(`Qwen API error: ${response.status}`);
      }

      // Return the stream directly
      return new Response(response.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    } else {
      // Use Groq API
      const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

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
    }
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Failed to generate response' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
