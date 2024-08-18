"use client";

import React, { useState } from 'react';
import { db } from './firebase';
import { collection, updateDoc, arrayUnion, doc, getDoc } from 'firebase/firestore';

export default function KitchenAssistant() {
  const [command, setCommand] = useState('');
  const [response, setResponse] = useState('');
  const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);

  const handleVoiceCommand = async (commandText: string) => {
    setCommand(commandText.toLowerCase());

    // List of phrases that indicate the user wants to end the conversation
    const closingStatements = ["no thank you", "thank you", "that's all", "goodbye", "i'm done", "nothing else", "stop", "cancel"];

    // Check if the user is trying to end the conversation
    const isClosingStatement = closingStatements.some(statement => commandText.includes(statement));

    if (isClosingStatement) {
      const closingResponse = "Thank you! If you need anything else, just ask. Have a great day!";
      setResponse(closingResponse);
      speak(closingResponse);
      return; // Exit the function early to avoid further processing
    }

    if (commandText.includes("suggest a recipe")) {
      await suggestRecipe();
    } else if (commandText.includes("add") && (commandText.includes("pantry") || commandText.includes("grocery list") || commandText.includes("items"))) {
      setResponse("Sure, start telling me the items you'd like to add.");
      speak("Sure, start telling me the items you'd like to add.");
    } else if (commandText.includes("add") && !["no", "cancel", "stop"].includes(commandText.trim())) {
      try {
        const { itemName, quantity } = await extractItemDetailsWithLlama(commandText);
        
        if (itemName && quantity) {
          await addToGroceryList(itemName, quantity);
        } else {
          setResponse("Sorry, I couldn't understand the item and quantity. Please try again.");
          speak("Sorry, I couldn't understand the item and quantity. Please try again.");
        }
      } catch (error) {
        console.error('Error handling voice command:', error);
        setResponse("Sorry, there was an error processing your request.");
        speak("Sorry, there was an error processing your request.");
      }
    } else if (commandText.includes("weather")) {
      await checkWeather();
    } else if (commandText.includes("play a song")) {
      await playSong(commandText.replace("play a song", "").trim());
    } else if (commandText.includes("available") && (commandText.includes("pantry") || commandText.includes("grocery") || commandText.includes("list"))) {
      await listAvailableItems();
    } else {
      await handleGeneralCommand(commandText);
    }
  };

  const handleGeneralCommand = async (commandText: string) => {
    try {
      const res = await fetch('/api/llama', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ command: commandText }),
      });

      if (!res.ok) {
        throw new Error('Failed to process command with LLaMA');
      }

      const data = await res.json();
      setResponse(data.response);
      speak(data.response);
    } catch (error) {
      console.error('Error in handleGeneralCommand:', error);
      setResponse("Sorry, I couldn't process your request.");
      speak("Sorry, I couldn't process your request.");
    }
  };

  const extractItemDetailsWithLlama = async (commandText: string): Promise<{ itemName: string, quantity: number }> => {
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: commandText }), // Send only the command text
      });

      if (!res.ok) {
        throw new Error('Failed to extract item details with LLaMA');
      }

      const { itemName, quantity } = await res.json(); // Directly access the parsed JSON response
      return { itemName, quantity };
    } catch (error) {
      console.error('Error in extractItemDetailsWithLlama:', error);
      throw error;
    }
  };

  const addToGroceryList = async (itemName: string, quantity: number) => {
    try {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 7); // Add 7 days to the current date
  
      const docRef = doc(db, 'grocery-list', 'Available Grocery Items');
      
      await updateDoc(docRef, {
        items: arrayUnion({
          itemName,
          quantity,
          expiryDate: expiryDate.toISOString(), // Set the expiry date to the new calculated date
        }),
      });
  
      const formattedDate = expiryDate.toLocaleDateString();
      const responseText = `Grocery list updated. You now have: ${itemName} (${quantity}). Expiry date: ${formattedDate}. Would you like to add anything else to the list?`;
      setResponse(responseText);
      speak(responseText);
    } catch (error) {
      console.error("Error updating document: ", error);
      setResponse("Sorry, I couldn't add the item to the list.");
      speak("Sorry, I couldn't add the item to the list.");
    }
  };

  const listAvailableItems = async () => {
    try {
      // Fetch the 'Available Grocery Items' document from the 'grocery-list' collection
      const docRef = doc(db, 'grocery-list', 'Available Grocery Items');
      const docSnap = await getDoc(docRef);
  
      if (!docSnap.exists()) {
        console.error("No available items found in the database.");
        setResponse("Your grocery list is currently empty.");
        speak("Your grocery list is currently empty.");
        return;
      }
  
      // Extract the items array from the document data
      const items = docSnap.data().items;
  
      if (!items || items.length === 0) {
        setResponse("Your grocery list is currently empty.");
        speak("Your grocery list is currently empty.");
      } else {
        const itemList = items.map(item => `${item.quantity} ${item.itemName}`).join(', ');
        const responseText = `You have the following items in your pantry: ${itemList}.`;
        
        console.log('Available items:', itemList); // Debugging line
        setResponse(responseText);
        speak(responseText);
      }
    } catch (error) {
      console.error("Error fetching available items from grocery list:", error);
      setResponse("Sorry, I couldn't fetch the items in your grocery list.");
      speak("Sorry, I couldn't fetch the items in your grocery list.");
    }
  };
  
  const suggestRecipe = async () => {
    try {
      const docRef = doc(db, 'grocery-list', 'Available Grocery Items');
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        console.error("No available items found in the database.");
        setResponse("Sorry, I couldn't find any available items to suggest a recipe.");
        speak("Sorry, I couldn't find any available items to suggest a recipe.");
        return;
      }

      const items = docSnap.data().items;
      const availableItems = items.map(item => item.itemName).join(', ');

      if (!availableItems) {
        console.error("No available items found in the document.");
        setResponse("Sorry, I couldn't find any available items to suggest a recipe.");
        speak("Sorry, I couldn't find any available items to suggest a recipe.");
        return;
      }

      const res = await fetch('/api/recipe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ availableItems }),
      });

      if (!res.ok) {
        console.error("Failed to fetch recipe");
        setResponse("Sorry, I couldn't find a recipe.");
        speak("Sorry, I couldn't find a recipe.");
        return;
      }

      const data = await res.json();
      const recipe = data.recipe;

      setResponse(recipe);
      speak(recipe);
    } catch (error) {
      console.error("Error suggesting recipe:", error);
      setResponse("Sorry, there was an error suggesting a recipe.");
      speak("Sorry, there was an error suggesting a recipe.");
    }
  };

  const checkWeather = async () => {
    const res = await fetch('/api/weather', {
      method: 'GET',
    });

    if (!res.ok) {
      console.error("Failed to fetch weather");
      setResponse("Sorry, I couldn't get the weather information.");
      speak("Sorry, I couldn't get the weather information.");
      return;
    }

    const data = await res.json();
    const weather = data.weather;

    setResponse(`The current weather is: ${weather}.`);
    speak(`The current weather is: ${weather}.`);
  };

  const playSong = async (song: string) => {
    setResponse(`Playing ${song}.`);
    speak(`Playing ${song}.`);
  };

  const speak = (text: string) => {
    const utterance = new SpeechSynthesisUtterance(text);
    const selectedVoice = speechSynthesis.getVoices().find(voice => voice.name === 'Your Voice Name') || null;

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    } else {
      console.warn("Selected voice not found, using default voice.");
    }

    utterance.onerror = (event: any) => {
      console.error("Speech synthesis error:", event.error);
    };

    speechSynthesis.speak(utterance);
  };

  const interruptSpeech = () => {
    speechSynthesis.cancel();
    console.log("Speech interrupted.");
  };

  const startRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.error("SpeechRecognition API is not supported in this browser.");
      alert("SpeechRecognition API is not supported in this browser.");
      return;
    }
  
    const newRecognition = new SpeechRecognition();
    newRecognition.lang = 'en-US';
    newRecognition.interimResults = false;
    newRecognition.maxAlternatives = 1;
  
    let timeout: NodeJS.Timeout | null = null;
  
    const resetTimeout = () => {
      if (timeout) {
        clearTimeout(timeout);
      }
      timeout = setTimeout(() => {
        console.log("No speech detected for 2 minutes. Stopping recognition.");
        newRecognition.stop();
      }, 2 * 60 * 1000); // 2 minutes timeout
    };
  
    newRecognition.onstart = () => {
      console.log("Speech recognition started.");
      resetTimeout(); // Start the timeout as soon as recognition starts
    };
  
    newRecognition.onresult = (event: any) => {
      if (event.results.length > 0) {
        const speechToText = event.results[0][0].transcript;
        console.log("Recognized text:", speechToText);
        handleVoiceCommand(speechToText);
        resetTimeout(); // Reset the timeout every time a result is received
      } else {
        console.log("No speech recognized.");
      }
    };
  
    newRecognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
    };
  
    newRecognition.onend = () => {
      console.log("Speech recognition ended.");
      if (recognition !== null) {
        setTimeout(() => {
          newRecognition.start(); // Automatically restart recognition if not stopped
        }, 500); // Slight delay to avoid conflicts
      }
    };
  
    newRecognition.start();
    setRecognition(newRecognition);
  };

  return (
    <div className="flex min-h-screen">
      {/* Left side with background image */}
      <div className="w-1/2 background-image"></div>

      {/* Right side with content */}
      <div className="w-1/2 flex flex-col justify-center p-8 bg-white bg-opacity-80">
        <h1 className="text-4xl font-bold mb-8 text-indigo-500 dark:text-indigo-300">Welcome to Chent</h1>
        <h3 className="text-lg font-semibold mb-4 text-gray-700">A smart kitchen application</h3>
        <div className="button-group flex justify-between mb-8">
          <button
            onClick={startRecognition}
            className="px-6 py-3 bg-green-500 text-white rounded-lg shadow-lg hover:bg-green-600 focus:outline-none"
          >
            Start Listening
          </button>
          <button
            onClick={interruptSpeech}
            className="px-6 py-3 bg-yellow-500 text-white rounded-lg shadow-lg hover:bg-yellow-600 focus:outline-none"
          >
            Interrupt
          </button>
        </div>
        <div className="transcript mb-4 p-6 bg-gray-200 dark:bg-gray-800 rounded-lg shadow-lg">
          <h2 className="text-2xl font-semibold mb-4 text-blue-600 dark:text-blue-300">Transcript</h2>
          <p className="text-gray-900 dark:text-gray-100 text-lg">{command}</p>
        </div>
        <div className="response p-6 bg-gray-200 dark:bg-gray-800 rounded-lg shadow-lg">
          <h2 className="text-2xl font-semibold mb-4 text-blue-600 dark:text-blue-300">Response</h2>
          <p className="text-gray-900 dark:text-gray-100 text-lg">{response}</p>
        </div>
      </div>
    </div>
  );
}
