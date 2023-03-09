import { OPENAI_KEY } from '$env/static/private';
import { getTokens } from '$lib/tokenizer';
import type {
  ChatCompletionRequestMessage,
  CreateChatCompletionRequest
} from 'openai';
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import type { Config } from '@sveltejs/adapter-vercel';

export const config: Config = {
  runtime: 'edge'
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    if (!OPENAI_KEY) {
      throw new Error('No OpenAI key found');
    }

    const requestData = await request.json();
    if (!requestData) {
      throw new Error('No request data found');
    }

    const reqMessages: ChatCompletionRequestMessage[] = requestData.messages;
    if (!reqMessages) {
      throw new Error('No messages provided');
    }

    let tokenCount = 0;

    reqMessages.forEach((message) => {
      const tokens = getTokens(message.content);
      tokenCount += tokens;
    });

    const mederationRes = await fetch('https://api.openai.com/v1/moderations', {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_KEY}`
      },
      method: 'POST',
      body: JSON.stringify({
        input: reqMessages[reqMessages.length - 1].content
      })
    });

    const moderationData = await mederationRes.json();
    const [results] = moderationData.results;

    if (results.flagged) {
      throw new Error('Message flagged by OpenAI');
    }

    const prompt = `
		Hello! You are going to act as a DSP teacher now. As
		an expert in Digital Signal Processing, you can provide
		guidance on various topics related to DSP. You can explain
		complex concepts in simple terms, provide Python code
		examples to illustrate them, and even help users with
		implementing DSP algorithms. So, feel free to ask me any
		questions about DSP, and I'll do my best to provide you
		with a clear and concise answer. Let's explore the exciting
		world of DSP together!`;

    tokenCount += getTokens(prompt);

    if (tokenCount > 4000) {
      throw new Error('Max tokens reached');
    }

    const messages: ChatCompletionRequestMessage[] = [
      { role: 'system', content: prompt },
      ...reqMessages
    ];

    const chatRequestsOpts: CreateChatCompletionRequest = {
      model: 'gpt-3.5-turbo',
      messages,
      temperature: 0.9,
      stream: true
    };

    const chatResponse = await fetch(
      'https://api.openai.com/v1/chat/completions',
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_KEY}`
        },
        method: 'POST',
        body: JSON.stringify(chatRequestsOpts)
      }
    );

    if (!chatResponse.ok) {
      const err = await chatResponse.json();
      throw new Error(err);
    }

    return new Response(chatResponse.body, {
      headers: {
        'Content-Type': 'text/event-stream'
      }
    });
  } catch (error) {
    console.log(error);
    return json(
      { error: 'There was an error processing your request' },
      { status: 500 }
    );
  }
  return new Response();
};
