import { useState, useRef, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Send, Loader2, Settings, Bot, User, Info, LogIn, Key } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import ApiKeySettings from "./ApiKeySettings";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { motion, AnimatePresence } from "framer-motion";

import { Link } from "wouter";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  model?: string; // Add model to track which AI model responded
}

interface ChatHistoryResponse {
  id: number;
  userId: number;
  model: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

// Model provider logos - updated with higher quality images
const providerLogos = {
  // Using updated logo URLs provided by the user
  openai: "https://static.vecteezy.com/system/resources/previews/022/227/364/non_2x/openai-chatgpt-logo-icon-free-png.png",
  google: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Google_Gemini_logo.svg/2560px-Google_Gemini_logo.svg.png",
  anthropic: "https://www.appengine.ai/uploads/images/profile/logo/Anthropic-AI.png",
  deepseek: "https://avatars.githubusercontent.com/u/145917633",
  meta: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Meta_Platforms_Inc._logo.svg/1280px-Meta_Platforms_Inc._logo.svg.png",
  chatglm: "https://cdn.tse4-mm.cn.bing.net/th/id/OIP-C.3J7B3GAsLdQ-caoA4NN9wAHaHa",
  alibaba: "https://logowik.com/content/uploads/images/alibaba-group2933.jpg",
  athene: "https://pbs.twimg.com/profile_images/1751975661099257856/83PSMX6w_400x400.jpg",
  xai: "https://grok.x.ai/assets/images/logo/logo.svg",
  yi: "https://www.01.ai/assets/logo.svg",
  default: "https://cdn-icons-png.flaticon.com/512/4616/4616734.png" // Default logo for unknown providers
};

// Model display names by provider and model ID
const modelDisplayNames = {
  openai: {
    "gpt-4o": "GPT-4o",
    "gpt-4-turbo": "GPT-4 Turbo",
    "gpt-3.5-turbo": "ChatGPT",
  },
  google: {
    "gemini-1.5-flash-002": "Gemini 1.5 Flash",
    "gemini-1.5-pro-002": "Gemini 1.5 Pro",
    "gemini-1.0-pro": "Gemini 1.0 Pro",
  },
  anthropic: {
    "claude-3-5-sonnet-20241022": "Claude 3.5 Sonnet",
    "claude-3-opus-20240229": "Claude 3 Opus",
    "claude-3-haiku-20240307": "Claude 3 Haiku",
  },
  deepseek: {
    "deepseek-r1": "Deepseek R1",
    "deepseek-chat": "Deepseek Chat",
  },
  meta: {
    "llama-3-70b": "Llama 3 70B",
    "llama-3-8b": "Llama 3 8B",
  },
  chatglm: {
    "chatglm-4": "ChatGLM 4",
    "chatglm-3": "ChatGLM 3",
  },
  alibaba: [
    { id: "qwen-max", name: "Qwen Max" },
    { id: "qwen-plus", name: "Qwen Plus" }
  ],
  athene: [
    { id: "athene-large", name: "Athene Large" }
  ],
  xai: [
    { id: "xai-grok-1", name: "Grok-1" }
  ],
  yi: [
    { id: "yi-large", name: "Yi-Large" },
    { id: "yi-medium", name: "Yi-Medium" }
  ]
};

export default function AiChat() {
  const [message, setMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<Message[]>([]);
  const [selectedModel, setSelectedModel] = useState("gemini-1.5-flash-002");
  const [selectedProvider, setSelectedProvider] = useState("google");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [preserveContext, setPreserveContext] = useState(true); // Add state for context preservation
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const user = { id: 1, username: 'self-hosted-user' };
  const isUserLoading = false;

  // Define scrollToBottom function here to fix the undefined error
  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  };

  // Fetch available API keys with fallback support
  const { data: primaryApiKeys, isLoading: isLoadingPrimaryKeys } = useQuery({
    queryKey: ["/api/keys"],
    onSuccess: (data) => {
      console.log("Available API keys from primary endpoint:", data?.map(k => k.provider) || []);
    },
    onError: (error) => {
      console.error("Error fetching primary API keys:", error);
    }
  });

  // Also try fetching from the alternate endpoint
  const { data: fallbackApiKeys, isLoading: isLoadingFallbackKeys } = useQuery({
    queryKey: ["/api/api-keys"],
    onSuccess: (data) => {
      console.log("Available API keys from fallback endpoint:", data?.map(k => k.provider) || []);
    },
    onError: (error) => {
      console.error("Error fetching fallback API keys:", error);
    }
  });

  // Combine keys from both endpoints, prioritizing primary endpoint
  const apiKeys = useMemo(() => {
    const primaryKeys = primaryApiKeys || [];
    const fallbackKeys = fallbackApiKeys || [];

    // Create a map to deduplicate by provider
    const keyMap = new Map();

    // Add primary keys first
    primaryKeys.forEach(key => {
      keyMap.set(key.provider, key);
    });

    // Add fallback keys only if the provider doesn't already exist
    fallbackKeys.forEach(key => {
      if (!keyMap.has(key.provider)) {
        keyMap.set(key.provider, key);
      }
    });

    // Convert map back to array
    return Array.from(keyMap.values());
  }, [primaryApiKeys, fallbackApiKeys]);

  // Combine loading states
  const isLoadingKeys = isLoadingPrimaryKeys || isLoadingFallbackKeys;

  // Fetch chat history
  const { data: historyData, isLoading: isLoadingHistory } = useQuery({
    queryKey: ["/api/chat/history"],
    onSuccess: (data: ChatHistoryResponse[]) => {
      // Transform the response data to our Message format
      const transformed: Message[] = data.map((item) => ({
        role: item.role,
        content: item.content,
        timestamp: item.createdAt,
        model: item.model,
      }));

      // Set chat history from API response
      setChatHistory(transformed);
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      // Extract context from previous messages if preserveContext is enabled
      const contextMessages = preserveContext 
        ? chatHistory.slice(-10) // Use last 10 messages for context regardless of model
        : chatHistory.filter(msg => msg.model === selectedModel).slice(-10); // Or only use messages from the current model

      // Add current user message
      const userMessage = {
        role: "user", 
        content: message,
        model: selectedModel
      };

      const messagesForAPI = [...contextMessages, userMessage].map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      console.log(`Sending request to /api/chat with model ${selectedModel} and ${messagesForAPI.length} messages`);

      // Log the API request for debugging
      console.log("API Request:", {
        model: selectedModel,
        messages: messagesForAPI,
        preserveContext
      });

      try {
        // Use fetch instead of apiRequest for more control over response handling
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: selectedModel,
            messages: messagesForAPI,
            preserveContext
          }),
          credentials: "include",
        });

        console.log("Raw response status:", response.status);

        // Check for error responses
        if (!response.ok) {
          let errorMessage = "Failed to send message";
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
          } catch (e) {
            errorMessage = await response.text() || errorMessage;
          }
          throw new Error(errorMessage);
        }

        // Try to parse as JSON first
        try {
          const jsonData = await response.json();
          console.log("Parsed JSON response:", jsonData);
          return jsonData;
        } catch (e) {
          console.error("Failed to parse JSON response:", e);

          // If JSON parsing fails, get as text
          const textData = await response.text();
          console.log("Response as text:", textData);

          // Return plain text wrapped in an object
          return { response: textData };
        }
      } catch (error) {
        console.error("Error in chat API request:", error);
        throw error;
      }
    },
    onSuccess: (data) => {
      // Log the entire data object to see its structure
      console.log("Complete response data from API:", JSON.stringify(data, null, 2));



      // Extract the response text - safely check all possible properties
      const responseText = typeof data === 'string' 
        ? data 
        : (data.response || data.message || data.content || data.text || 
           (typeof data === 'object' && Object.values(data)[0]) || 
           "No response received");

      console.log("Extracted response text:", responseText);

      // Directly update the chat history with the response for immediate feedback
      // Replace the latest "..." message with the actual response
      setChatHistory(prev => {
        const newHistory = [...prev];
        // Find and replace the loading message
        const loadingMsgIndex = newHistory.findIndex(msg => msg.content === "...");

        // Log for debugging
        console.log("Loading message index:", loadingMsgIndex);

        if (loadingMsgIndex !== -1) {
          newHistory[loadingMsgIndex] = {
            role: "assistant",
            content: responseText,
            timestamp: new Date().toISOString(),
            model: selectedModel
          };
        } else {
          // If no loading message found, add the response as a new message
          console.log("No loading message found, adding response as new message");
          newHistory.push({
            role: "assistant",
            content: responseText,
            timestamp: new Date().toISOString(),
            model: selectedModel
          });
        }
        return newHistory;
      });

      // Force a re-render by updating the state
      setTimeout(() => {
        scrollToBottom();
      }, 100);

      // Then invalidate the query to update history in the background (for consistency)
      queryClient.invalidateQueries({ queryKey: ["/api/chat/history"] });
    },
    onError: (error: any) => {
      // Check if it's an API key required error
      const isApiKeyError = error.response?.data?.error === "API_KEY_REQUIRED";
      const provider = error.response?.data?.apiProvider || selectedProvider;

      // Show appropriate toast message
      if (isApiKeyError) {
        toast({
          title: "API Key Required",
          description: `You need to add your ${provider} API key in settings to use this model.`,
          variant: "warning",
          action: (
            <Button 
              variant="outline" 
              size="sm" 
              className="border-yellow-700/50 bg-yellow-900/30 text-yellow-400 hover:bg-yellow-800/50"
              onClick={() => setIsSettingsOpen(true)}
            >
              Add Key
            </Button>
          )
        });
      } else {
        toast({
          title: "Error",
          description: error.message || "Failed to send message",
          variant: "destructive",
        });
      }

      // Replace the loading message with an appropriate error
      setChatHistory(prev => {
        const newHistory = [...prev];
        const loadingMsgIndex = newHistory.findIndex(msg => msg.content === "...");
        const errorMessage = isApiKeyError 
          ? `I need an API key for ${provider} to respond. Please add your API key in settings.`
          : "Sorry, I encountered an error. Please try again later.";

        if (loadingMsgIndex !== -1) {
          newHistory[loadingMsgIndex] = {
            role: "assistant",
            content: errorMessage,
            timestamp: new Date().toISOString(),
            model: selectedModel
          };
        } else {
          // If no loading message found, add a new error message
          newHistory.push({
            role: "assistant",
            content: errorMessage,
            timestamp: new Date().toISOString(),
            model: selectedModel
          });
        }
        return newHistory;
      });
    }
  });

  // Define available models by provider
  const modelsByProvider: Record<string, {id: string, name: string}[]> = {
    openai: [
      { id: "gpt-4.1", name: "GPT-4.1" },
      { id: "gpt-4.1-mini", name: "GPT-4.1 Mini" },
      { id: "gpt-4.1-nano", name: "GPT-4.1 Nano" },
      { id: "gpt-4o", name: "GPT-4o" },
      { id: "gpt-4-turbo", name: "GPT-4 Turbo" },
      { id: "gpt-4", name: "GPT-4" },
      { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo" }
    ],
    google: [
      { id: "gemini-2.5-flash-preview-04-17", name: "Gemini 2.5 Flash Preview" },
      { id: "gemini-2.5-pro-preview-03-25", name: "Gemini 2.5 Pro Preview" },
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
      { id: "gemini-2.0-flash-lite", name: "Gemini 2.0 Flash Lite" },
      { id: "gemini-1.5-flash-002", name: "Gemini 1.5 Flash" },
      { id: "gemini-1.5-pro-002", name: "Gemini 1.5 Pro" },
      { id: "gemini-1.0-pro", name: "Gemini 1.0 Pro" }
    ],
    anthropic: [
      { id: "claude-3-7-sonnet-20250219", name: "Claude 3.7 Sonnet" },
      { id: "claude-3-5-sonnet-v2-20241022", name: "Claude 3.5 Sonnet v2" },
      { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku" },
      { id: "claude-3-opus-20240229", name: "Claude 3 Opus" },
      { id: "claude-3-sonnet-20240229", name: "Claude 3 Sonnet" },
      { id: "claude-3-haiku-20240307", name: "Claude 3 Haiku" }
    ],
    deepseek: [
      { id: "deepseek-r1", name: "Deepseek R1" },
      { id: "deepseek-chat", name: "Deepseek Chat" }
    ],
    meta: [
      { id: "llama-3-70b", name: "Llama 3 70B" },
      { id: "llama-3-8b", name: "Llama 3 8B" }
    ],
    chatglm: [
      { id: "chatglm-4", name: "ChatGLM 4" },
      { id: "chatglm-3", name: "ChatGLM 3" }
    ],
    alibaba: [
      { id: "qwen-max", name: "Qwen Max" },
      { id: "qwen-plus", name: "Qwen Plus" }
    ],
    athene: [
      { id: "athene-large", name: "Athene Large" }
    ],
    xai: [
      { id: "xai-grok-1", name: "Grok-1" }
    ],
    yi: [
      { id: "yi-large", name: "Yi-Large" },
      { id: "yi-medium", name: "Yi-Medium" }
    ]
  };

  // Handler for provider change
  const handleProviderChange = (provider: string) => {
    setSelectedProvider(provider);
    // Set the first model of the new provider as selected
    if (modelsByProvider[provider]?.length > 0) {
      setSelectedModel(modelsByProvider[provider][0].id);
    }
  };

  // Add a more robust useEffect to scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [chatHistory]);

  // Add debugging logs for chat history updates
  useEffect(() => {
    console.log("AiChat component rendered with:", {
      selectedModel,
      selectedProvider,
      isLoadingHistory,
      messagesCount: chatHistory.length
    });

    // Log the complete chat history for debugging
    console.log("Current chat history:", JSON.stringify(chatHistory, null, 2));
  }, [chatHistory, selectedModel, selectedProvider, isLoadingHistory]);

  // Add a useEffect to better preserve context between chat history updates
  useEffect(() => {
    if (historyData && preserveContext) {
      // Ensure all messages have the currently selected model assigned when preserve context is enabled
      setChatHistory(prev => prev.map(msg => {
        if (msg.role === "assistant" && !msg.model) {
          return { ...msg, model: selectedModel };
        }
        return msg;
      }));
    }
  }, [selectedModel, preserveContext]);

  const handleSendMessage = async () => {
    if (!message.trim()) return;

    const userMessage: Message = {
      role: "user",
      content: message,
      timestamp: new Date().toISOString(),
      model: selectedModel,
    };

    // Add the user message to chat history
    setChatHistory((prev) => [...prev, userMessage]);

    // Create an assistant message placeholder with "typing" indicator
    const assistantPlaceholder: Message = {
      role: "assistant",
      content: "...",
      timestamp: new Date().toISOString(),
      model: selectedModel,
    };

    // Add the placeholder to chat
    setChatHistory((prev) => [...prev, assistantPlaceholder]);

    // Clear the input field
    setMessage("");

    // Scroll to bottom safely
    setTimeout(() => {
      scrollToBottom();
    }, 100);

    try {
      console.log("Before sending message - content:", userMessage.content);

      // Use the mutation to send the message
      const response = await sendMessageMutation.mutateAsync(userMessage.content);
      console.log("Message sent successfully, received response:", response);

      // Note: Normally the onSuccess callback would handle the response,
      // but we'll add a direct update here for immediate feedback

      // This is a fallback in case the mutation's onSuccess doesn't trigger
      if (response && !response.error) {
        console.log("Backup direct update with response:", response);

        // Extract the response text using a comprehensive check for different formats
        let responseText = '';

        // Handle string responses
        if (typeof response === 'string') {
          responseText = response;
        } 
        // Handle object responses with standard fields
        else if (typeof response === 'object' && response !== null) {
          // Try all common response fields
          responseText = response.response || 
                         response.message || 
                         response.content || 
                         response.text || 
                         response.answer ||
                         response.result ||
                         response.output ||
                         '';

          // If still no content found, try to extract the first string value
          if (!responseText && typeof response === 'object') {
            const values = Object.values(response);
            for (const val of values) {
              if (typeof val === 'string' && val.length > 0) {
                responseText = val;
                break;
              }
            }
          }
        }

        // Default message if we couldn't extract any text
        if (!responseText) {
          responseText = "Received a response but couldn't extract the content. Please try again.";
        }

        console.log("Extracted response text for direct update:", responseText);

        // Find and update the placeholder message directly
        setChatHistory(prev => {
          const newHistory = [...prev];
          const loadingIndex = newHistory.findIndex(msg => msg.content === "...");

          if (loadingIndex !== -1) {
            newHistory[loadingIndex] = {
              role: "assistant",
              content: responseText,
              timestamp: new Date().toISOString(),
              model: selectedModel
            };
          } else {
            // If no loading message found (unusual case), add as new message
            newHistory.push({
              role: "assistant",
              content: responseText,
              timestamp: new Date().toISOString(),
              model: selectedModel
            });
          }
          return newHistory;
        });

        setTimeout(() => {
          scrollToBottom();
        }, 100);
      }
    } catch (error) {
      console.error("Error sending message:", error);

      // Show error in chat in case the mutation's onError doesn't handle it
      setChatHistory(prev => {
        const newHistory = [...prev];
        const loadingIndex = newHistory.findIndex(msg => msg.content === "...");
        const errorMessage = "Sorry, there was an error processing your request. Please try again.";

        if (loadingIndex !== -1) {
          newHistory[loadingIndex] = {
            role: "assistant",
            content: errorMessage,
            timestamp: new Date().toISOString(),
            model: selectedModel
          };
        }
        return newHistory;
      });
    }
  };

  // Get the display name for a model
  const getModelDisplayName = (model?: string) => {
    if (!model) return "AI Assistant";

    // Extract provider from model ID
    const provider = Object.keys(modelDisplayNames).find(p => 
      Object.keys(modelDisplayNames[p]).includes(model)
    );

    if (provider && modelDisplayNames[provider][model]) {
      return modelDisplayNames[provider][model];
    }

    return "AI Assistant";
  };

  // Enhanced function for getting model logos
  const getLogoForModel = (model?: string) => {
    if (!model) return providerLogos.default;

    // Extract provider from model name
    let provider = "default";

    if (model.includes("gpt") || model.includes("o1-") || model.includes("o3-") || model.includes("text-")) {
      provider = "openai";
    } else if (model.includes("gemini")) {
      provider = "google";
    } else if (model.includes("claude")) {
      provider = "anthropic";
    } else if (model.includes("deepseek")) {
      provider = "deepseek";
    } else if (model.includes("llama")) {
      provider = "meta";
    } else if (model.includes("glm")) {
      provider = "chatglm";
    } else if (model.includes("qwen")) {
      provider = "alibaba";
    } else if (model.includes("athene")) {
      provider = "athene";
    } else if (model.includes("grok")) {
      provider = "xai";
    } else if (model.includes("yi")) {
      provider = "yi";
    }

    return providerLogos[provider] || providerLogos.default;
  };

  // Preload provider logos to avoid loading issues
  useEffect(() => {
    Object.values(providerLogos).forEach(url => {
      const img = new Image();
      img.src = url;
    });
  }, []);

  // Check if user is logged in
  if (!user) {
    return (
      <div className="flex flex-col h-full bg-gradient-to-b from-slate-900 to-indigo-950 rounded-xl border border-slate-800 shadow-xl p-8 text-center">
        <div className="flex flex-col items-center justify-center h-full">
          <Bot className="h-16 w-16 text-indigo-400 mb-4" />
          <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400 mb-4">
            Please Log In to Use AI Chat
          </h2>
          <p className="text-slate-300 max-w-md mb-8">
            You need to be logged in to use the AI chat features. Sign up for free or log in to your account.
          </p>
          <div className="flex gap-4">
            <Link href="/auth/login">
              <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">
                <LogIn className="mr-2 h-4 w-4" />
                Log In
              </Button>
            </Link>
            <Link href="/auth/signup">
              <Button variant="outline" className="border-indigo-500/50 bg-indigo-950/50 text-indigo-300 hover:bg-indigo-900/50">
                Create Account
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-slate-900 to-indigo-950 rounded-xl border border-slate-800 shadow-xl p-4">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex justify-between items-center mb-4 pb-4 border-b border-slate-800"
      >
        <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
          Chat with AI Models
        </h2>

        <div className="flex items-center gap-2">
          {/* Preserve Context Toggle */}
          <div className="relative group">
            <div className="flex items-center gap-1.5 bg-slate-800/50 rounded-md px-2 py-1 border border-slate-700/50 hover:border-slate-600/50 transition-colors duration-200">
              <input 
                type="checkbox" 
                id="preserve-context"
                checked={preserveContext}
                onChange={() => setPreserveContext(!preserveContext)}
                className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-800 text-indigo-500 focus:ring-indigo-500/25"
              />
              <label 
                htmlFor="preserve-context" 
                className={`text-xs cursor-pointer ${preserveContext ? 'text-indigo-400 font-medium' : 'text-slate-300'}`}
              >
                Preserve Context
                {preserveContext && (
                  <span className="ml-1 text-xs bg-indigo-900/50 px-1 py-0.5 rounded text-indigo-300">
                    ON
                  </span>
                )}
              </label>
              <div className="absolute bottom-full left-0 mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-slate-800 text-xs text-slate-300 p-2 rounded shadow-lg w-48 pointer-events-none z-50">
                {preserveContext ? 
                  "Context will be preserved when switching between models" : 
                  "Each model will have its own separate conversation"
                }
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            {/* Provider dropdown with logo */}
            <div className="relative">
              <select
                value={selectedProvider}
                onChange={(e) => handleProviderChange(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-slate-200 rounded-md pl-9 pr-3 py-1.5 text-sm focus:ring-indigo-500 focus:border-indigo-500 appearance-none"
              >
                {Object.keys(modelsByProvider).map(provider => {
                  // Only show providers for which user has API keys
                  const hasApiKey = apiKeys?.some(k => k.provider === provider);
                  if (!hasApiKey && apiKeys?.length > 0) return null;

                  return (
                    <option key={provider} value={provider}>
                      {provider.charAt(0).toUpperCase()+ provider.slice(1)}
                    </option>
                  );
                })}
              </select>
              {providerLogos[selectedProvider] && (
                <div className="absolute left-2 top-1/2 transform -translate-y-1/2 w-5 h-5 rounded-full overflow-hidden">
                  <img
                    src={providerLogos[selectedProvider]}
                    alt={selectedProvider}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.src = providerLogos.default; // Fallback to default if image fails to load
                    }}
                  />
                </div>
              )}
            </div>

            {/* Model dropdown */}
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-slate-200 rounded-md px-3 py-1.5 text-sm focus:ring-indigo-500 focus:border-indigo-500"
            >
              {modelsByProvider[selectedProvider]?.map(model => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>

            {/* Model selection dropdown only */}
          </div>

          <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
            <DialogTrigger asChild>
              <Button 
                variant="outline" 
                size="icon" 
                title="API Settings"
                className="border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] bg-slate-900 border-slate-700 max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-xl font-semibold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
                  API Key Settings
                </DialogTitle>
                <DialogDescription className="text-slate-400 mt-1.5">
                  Add your API keys to use different AI models. Your keys are encrypted and stored securely.
                </DialogDescription>
              </DialogHeader>
              <ApiKeySettings />
            </DialogContent>
          </Dialog>
        </div>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="flex-1 overflow-y-auto border border-slate-700 rounded-md p-4 mb-4 bg-slate-900/50"
      >
        {isLoadingHistory ? (
          <div className="flex justify-center items-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
          </div>
        ) : chatHistory.length === 0 ? (
          <div className="text-center text-slate-400 h-full flex flex-col justify-center">
            <div className="bg-indigo-900/30 p-6 rounded-xl border border-indigo-800/50 max-w-md mx-auto">
              <Bot className="h-12 w-12 text-indigo-400 mx-auto mb-4" />
              <p className="text-lg font-medium text-white mb-2">No messages yet</p>
              <p className="text-slate-400 mb-6">Start a conversation with an AI assistant</p>

              {!apiKeys || apiKeys.length === 0 ? (
                <div className="bg-gradient-to-r from-amber-900/30 to-red-900/30 border border-amber-800/50 rounded-md p-4 mx-auto max-w-md mt-4">
                  <div className="flex flex-col items-center text-center">
                    <Key className="h-6 w-6 text-amber-400 mb-2" />
                    <h4 className="text-amber-400 font-medium mb-1">API Key Required</h4>
                    <p className="text-xs text-amber-300/90 mb-3">
                      You must provide your own API keys to use the AI Chat feature. This helps us keep costs manageable.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsSettingsOpen(true)}
                      className="bg-amber-800/30 hover:bg-amber-800/50 text-amber-300 border-amber-700/50"
                    >
                      <Key className="h-3.5 w-3.5 mr-2" />
                      Add Your API Keys
                    </Button>
                  </div>
                </div>
              ) : !apiKeys?.some(k => k.provider === selectedProvider) ? (
                <div className="bg-gradient-to-r from-amber-900/30 to-red-900/30 border border-amber-800/50 rounded-md p-4 mx-auto max-w-md mt-4">
                  <div className="flex flex-col items-center text-center">
                    <Key className="h-6 w-6 text-amber-400 mb-2" />
                    <h4 className="text-amber-400 font-medium mb-1">Provider API Key Required</h4>
                    <p className="text-xs text-amber-300/90 mb-3">
                      You need to add an API key for {selectedProvider.charAt(0).toUpperCase() + selectedProvider.slice(1)} to use this model.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsSettingsOpen(true)}
                      className="bg-amber-800/30 hover:bg-amber-800/50 text-amber-300 border-amber-700/50"
                    >
                      <Key className="h-3.5 w-3.5 mr-2" />
                      Add {selectedProvider.charAt(0).toUpperCase() + selectedProvider.slice(1)} API Key
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <AnimatePresence initial={false}>
              {chatHistory.map((msg, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`p-4 rounded-lg ${
                    msg.role === "user"
                      ? "bg-indigo-900/30 border border-indigo-800/50 ml-auto max-w-[80%]"
                      : "bg-slate-800/70 border border-slate-700/50 mr-auto max-w-[80%]"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    {msg.role === "user" ? (
                      <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center">
                        <User className="h-3.5 w-3.5 text-white" />
                      </div>
                    ) : (
                      <div className="flex items-center justify-center w-6 h-6 overflow-hidden rounded-full bg-slate-700">
                        {msg.model ? (
                          <img 
                            src={getLogoForModel(msg.model)} 
                            alt={getModelDisplayName(msg.model)}
                            className="w-full h-full object-contain"
                            loading="eager"
                            onError={(e) => {
                              console.log(`Error loading logo for ${msg.model}, using default`);
                              e.currentTarget.src = providerLogos.default; // Fallback if image loading fails
                            }}
                          />
                        ) : (
                          <Bot className="h-3.5 w-3.5 text-white" />
                        )}
                      </div>
                    )}
                    <div className="text-xs text-slate-400">
                      {msg.role === "user" ? "You" : getModelDisplayName(msg.model)} • {new Date(msg.timestamp).toLocaleTimeString()}
                    </div>
                  </div>

                  {/* Add debugging information for message content - rendered outside the JSX */}
                  <div className="hidden">
                    {console.log(`Message ${index} content: ${JSON.stringify(msg.content)}`)}
                  </div>

                  {msg.content === "..." ? (
                    <div className="flex space-x-1 items-center py-2">
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
                    </div>
                  ) : (
                    <div className="prose prose-invert prose-sm max-w-none overflow-auto markdown-content">
                      <div className="prose prose-invert">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {typeof msg.content === 'string' ? msg.content : ''}
                        </ReactMarkdown>
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
            <div ref={messagesEndRef} />
          </div>
        )}
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="flex gap-2"
      >
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message..."
          className="resize-none bg-slate-800/50 border-slate-700 text-slate-200 placeholder:text-slate-500 focus:border-indigo-500 focus:ring-indigo-500/20"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSendMessage();
            }
          }}
        />
        <Button
          onClick={handleSendMessage}
          disabled={!message.trim() || sendMessageMutation.isPending || (!apiKeys || apiKeys.length === 0)}
          title={(!apiKeys || apiKeys.length === 0) ? "Add API keys first" : "Send message"}
          className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white"
        >
          {sendMessageMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </motion.div>
    </div>
  );
}
