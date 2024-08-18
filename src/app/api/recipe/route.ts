import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { availableItems } = await req.json();

  // Check if the API key is available
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('API key not found');
    return NextResponse.json({ error: "API key is missing" }, { status: 500 });
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "meta-llama/llama-3.1-8b-instruct",
      messages: [
        { role: "system", content: "You are an assistant that provides specific recipe suggestions based on available ingredients. Only respond with a recipe or cooking instructions based on the provided ingredients." },
        { role: "user", content: `Here are the ingredients I have: ${availableItems}. Can you suggest a recipe using these ingredients?` }
      ],
    })
  });

  if (!response.ok) {
    console.error('LLaMA API request failed with status:', response.status);
    return NextResponse.json({ error: "Failed to process recipe request with LLaMA" }, { status: 500 });
  }

  const completion = await response.json();
  const recipe = completion.choices[0].message.content.trim();

  return NextResponse.json({ recipe });
}
