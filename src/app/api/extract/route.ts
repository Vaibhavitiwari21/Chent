import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { prompt } = await req.json();

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
        { role: "system", content: "You are an assistant that extracts information and outputs only valid JSON. Do not include any explanation or extra information. Only respond with a JSON object that has the following structure: {\"itemName\": \"string\", \"quantity\": \"number\"}." },
        { role: "user", content: `Extract the item name and quantity from the following command: "${prompt}"` }
      ],
    })
  });

  if (!response.ok) {
    console.error('LLaMA API request failed with status:', response.status);
    return NextResponse.json({ error: "Failed to process command with LLaMA" }, { status: 500 });
  }

  const completion = await response.json();
  const rawJson = completion.choices[0].message.content;
  console.log('Raw response from LLaMA:', rawJson); // Detailed logging of the raw response

  // Extracting JSON from the response content
  const startIndex = rawJson.indexOf('{');
  const endIndex = rawJson.lastIndexOf('}') + 1;

  if (startIndex === -1 || endIndex === -1) {
    console.error('Failed to find valid JSON in LLaMA response');
    return NextResponse.json({ error: "Failed to extract JSON from LLaMA response" }, { status: 500 });
  }

  const jsonString = rawJson.substring(startIndex, endIndex);
  console.log('Extracted JSON string:', jsonString); // Logging extracted JSON string

  try {
    const parsedData = JSON.parse(jsonString);
    console.log('Parsed data:', parsedData); // Logging the parsed data

    const { itemName, quantity } = parsedData;

    if (!itemName || !quantity) {
      console.error('Missing fields in parsed data:', parsedData);
      return NextResponse.json({ error: "Invalid data received from LLaMA" }, { status: 500 });
    }

    return NextResponse.json({ itemName, quantity });
  } catch (error) {
    console.error('Error parsing JSON from LLaMA response:', error);
    return NextResponse.json({ error: "Failed to parse JSON from LLaMA response" }, { status: 500 });
  }
}
