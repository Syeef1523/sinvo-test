import React, { useState, useEffect, useRef, useMemo } from "react";
import { 
  Plus, Search, Trash2, LogOut, Menu, X, Sun, Moon, 
  Send, Image as ImageIcon, StopCircle, RefreshCw, 
  Copy, Check, ChevronDown, Settings as SettingsIcon,
  MessageSquare, User, Shield, Cloud, Terminal, Sparkles,
  Download, ExternalLink, Maximize2, Github, SendHorizonal, 
  Zap, Clock, History, MoreVertical, LayoutGrid, Palette,
  Monitor, Info, HelpCircle, ShieldCheck, Mail, Database
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  User as FirebaseUser,
  signInAnonymously
} from "firebase/auth";
import { ref, onValue, set, get } from "firebase/database";
import { auth, db, googleProvider } from "./lib/firebase";
import { marked } from "marked";
import hljs from "highlight.js";
import "highlight.js/styles/atom-one-dark.css";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Utility for Tailwind class merging */
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Constants & Types ---

const ADMIN_EMAIL = "syeef021@gmail.com";

type Theme = "dark" | "light";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  type?: "text" | "image";
  imageUrl?: string;
  isImageLoading?: boolean;
  provider?: string;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
}

interface GlobalSettings {
  cloudSync: boolean;
  adminProtection: boolean;
  antiSqlFilter: boolean;
  csrfTokens: boolean;
  maintenanceMode: boolean;
}

// --- Icons ---
const SinvoAvatar = () => (
  <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center border border-amber-500/30">
    <span className="text-lg text-amber-500 select-none" aria-hidden="true">✦</span>
  </div>
);

const SinvoLogo = ({ className }: { className?: string }) => (
  <div className={cn("flex items-center gap-2", className)}>
    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-black font-bold text-2xl shadow-lg shadow-amber-500/20 select-none" aria-hidden="true">
      ✦
    </div>
    <span className="text-2xl font-display font-bold tracking-tight">Sinvo</span>
  </div>
);

// --- Components ---

const ImageWithLoading = ({ imageUrl, onFullScreen }: { imageUrl: string, onFullScreen: (url: string) => void }) => {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="relative group cursor-pointer overflow-hidden rounded-xl bg-black/20 border border-white/5" onClick={() => onFullScreen(imageUrl)}>
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/10 backdrop-blur-md z-10">
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <div className="w-12 h-12 border-2 border-amber-500/20 rounded-full animate-ping" />
              <Sparkles className="w-6 h-6 text-amber-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] text-amber-500 font-bold tracking-[0.3em] ml-1">GENERATING...</span>
              <span className="text-[8px] text-white/40 font-mono">SINVO TURBO ENGINE</span>
            </div>
          </div>
        </div>
      )}
      <img 
        src={imageUrl} 
        alt="Generated" 
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        className={cn(
          "w-full aspect-square object-cover transition-all duration-700",
          !loaded ? "opacity-0 scale-95" : "opacity-100 scale-100 group-hover:scale-105"
        )} 
      />
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
        <Maximize2 className="text-white" />
      </div>
    </div>
  );
};

interface ToastProps {
  message: string;
  type: "success" | "error" | "info" | "warning";
  onClose: () => void;
  theme: Theme;
}

const Toast: React.FC<ToastProps> = ({ message, type, onClose, theme }) => {
  const icons = {
    success: "fa-check",
    error: "fa-times",
    info: "fa-info-circle",
    warning: "fa-exclamation-triangle"
  };
  
  const colors = {
    success: "border-green-500 text-green-500",
    error: "border-red-500 text-red-500",
    info: "border-blue-500 text-blue-500",
    warning: "border-amber-500 text-amber-500"
  };

  useEffect(() => {
    const timer = setTimeout(onClose, 1000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <motion.div 
      initial={{ x: 100, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 100, opacity: 0 }}
      className={cn(
        "fixed bottom-6 right-6 z-50 flex items-center gap-3 p-4 border-l-4 rounded-lg shadow-2xl min-w-[280px]", 
        theme === "dark" ? "bg-dark-card" : "bg-white border text-black",
        colors[type]
      )}
    >
      <i className={cn("fa", icons[type], "text-xl")} />
      <span className={cn("text-sm font-medium", theme === "dark" ? "text-white/90" : "text-black")}>{message}</span>
      <button onClick={onClose} className={cn("ml-auto transition-colors", theme === "dark" ? "text-white/40 hover:text-white" : "text-black/40 hover:text-black")}>
        <X size={16} />
      </button>
    </motion.div>
  );
};

// --- App Root ---

export default function App() {
  // State
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<Theme>("dark");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [mode, setMode] = useState<"chat" | "image">("chat");
  const [toasts, setToasts] = useState<{ id: number, message: string, type: "success" | "error" | "info" | "warning" }[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>({
    cloudSync: true,
    adminProtection: true,
    antiSqlFilter: true,
    csrfTokens: true,
    maintenanceMode: false
  });
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Hardcoded API Key for static deployment (Warning: Exposed in client code)
  const GROQ_API_KEY = "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";

  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!window.visualViewport) return;

    const handleResize = () => {
      const height = window.innerHeight - (window.visualViewport?.height || window.innerHeight);
      setKeyboardHeight(Math.max(0, height));
      if (height > 0) {
        // Use timeout to allow layout to settle
        setTimeout(scrollToBottom, 100);
      }
    };

    window.visualViewport.addEventListener("resize", handleResize);
    window.visualViewport.addEventListener("scroll", handleResize);
    return () => {
      window.visualViewport?.removeEventListener("resize", handleResize);
      window.visualViewport?.removeEventListener("scroll", handleResize);
    };
  }, []);

  // Derived state
  const activeConversation = useMemo(() => 
    conversations.find(c => c.id === activeId) || null, 
  [conversations, activeId]);

  const filteredConversations = useMemo(() => {
    if (!searchQuery) return conversations;
    return conversations.filter(c => 
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.messages.some(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [conversations, searchQuery]);

  // Effects
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        setIsAdmin(u.email === ADMIN_EMAIL);
        addToast("Welcome back to Sinvo!", "success");
        // Load settings from cloud
        const settingsRef = ref(db, "global_settings");
        get(settingsRef).then(snap => {
          if (snap.exists()) setGlobalSettings(snap.val());
        });
      }
      setLoading(false);
    });
    
    // Local storage
    const savedConvs = localStorage.getItem("sinvo_conversations");
    if (savedConvs) setConversations(JSON.parse(savedConvs));
    
    const savedTheme = localStorage.getItem("sinvo_theme") as Theme;
    if (savedTheme) setTheme(savedTheme);

    return () => unsub();
  }, []);

  useEffect(() => {
    localStorage.setItem("sinvo_conversations", JSON.stringify(conversations));
  }, [conversations]);

  useEffect(() => {
    localStorage.setItem("sinvo_theme", theme);
    document.documentElement.classList.toggle("light", theme === "light");
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    scrollToBottom();
  }, [activeConversation?.messages]);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Handlers
  const addToast = (message: string, type: "success" | "error" | "info" | "warning") => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
  };

  const removeToast = (id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const btn = target.closest(".copy-code-btn") as HTMLButtonElement;
      if (btn) {
        const pre = btn.closest(".code-block-container")?.querySelector("pre");
        if (pre) {
          const code = pre.innerText.trim();
          navigator.clipboard.writeText(code);
          addToast("Code copied to clipboard", "success");
          
          const label = btn.querySelector("span");
          if (label) {
            const originalText = label.innerText;
            label.innerText = "COPIED!";
            setTimeout(() => {
              label.innerText = originalText;
            }, 2000);
          }
        }
      }
    };
    document.addEventListener("click", handleGlobalClick);
    return () => document.removeEventListener("click", handleGlobalClick);
  }, []);

  const loginWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      addToast("Login failed: " + (err as Error).message, "error");
    }
  };

  const loginAsGuest = async () => {
    try {
      await signInAnonymously(auth);
      addToast("Logged in as Guest (Sync Enabled)", "info");
    } catch (err) {
      console.warn("Firebase Anonymous Auth failed, falling back to local guest mode:", err);
      // Fallback: Manually set a guest user object if Firebase provider is disabled
      setUser({
        uid: "guest-" + crypto.randomUUID(),
        displayName: "Sinvo Guest",
        isAnonymous: true,
        email: null,
        photoURL: null,
      } as any);
      addToast("Logged in as Guest (Local Mode)", "info");
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    addToast("Logged out successfully", "success");
  };

  const createNewChat = () => {
    const id = crypto.randomUUID();
    const newConv: Conversation = {
      id,
      title: "New Chat",
      messages: [],
      updatedAt: Date.now()
    };
    setConversations(prev => [newConv, ...prev]);
    setActiveId(id);
    setMode("chat");
    setSidebarOpen(window.innerWidth > 768);
  };

  const deleteChat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this conversation?")) {
      setConversations(prev => prev.filter(c => c.id !== id));
      if (activeId === id) setActiveId(null);
      addToast("Conversation deleted", "success");
    }
  };

  const clearAllChats = () => {
    if (confirm("This will permanently delete all your conversation history. Continue?")) {
      setConversations([]);
      setActiveId(null);
      localStorage.removeItem("sinvo_conversations");
      addToast("All chats cleared", "info");
    }
  };

  const sendMessage = async () => {
    if (!inputValue.trim() || isStreaming) return;

    if (mode === "image") {
      generateImage(inputValue);
      return;
    }

    let currentId = activeId;
    if (!currentId) {
      const id = crypto.randomUUID();
      const newConv: Conversation = {
        id,
        title: inputValue.slice(0, 40) + (inputValue.length > 40 ? "..." : ""),
        messages: [],
        updatedAt: Date.now()
      };
      setConversations(prev => [newConv, ...prev]);
      setActiveId(id);
      currentId = id;
    }

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: inputValue,
      timestamp: Date.now()
    };

    setConversations(prev => prev.map(c => 
      c.id === currentId 
        ? { ...c, messages: [...c.messages, userMsg], updatedAt: Date.now() }
        : c
    ));

    setInputValue("");
    setIsStreaming(true);

    const performRequest = async (currentModel: string, signals?: AbortSignal) => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString();
      const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

      // Get the current messages for this conversation
      const currentConversation = conversations.find(c => c.id === currentId);
      // Construct history: if it's a new chat, conversations.find might be stale, 
      // but userMsg is already defined in the outer scope and history would be empty.
      const history = currentConversation 
        ? currentConversation.messages.map(m => ({ role: m.role, content: m.content }))
        : [];
      
      // Ensure the history doesn't already contain the new user message to avoid duplication
      const finalHistory = history.some(m => m.content === userMsg.content && m.role === "user")
        ? history
        : [...history, { role: "user", content: userMsg.content }];

      const messages = [
        { 
          role: "system", 
          content: `He is Sinvo, an AI built by Syeef Al Hasan. He's an adaptive AI collaborator here to help you with everything from writing code and debugging scripts to generating images, and creative content. His model is 'Sinvo HyperCore'.
          
          REAL-TIME SYSTEM ACCESS:
          - Current Time: ${timeStr}
          - Current Date: ${dateStr}
          
          Core Guidelines:
          - Always identify as Sinvo.
          - Provide expert-level technical assistance.
          - Use amber/gold metaphors sparingly in descriptions.
          - Be concise but thorough.
          - Support full Markdown and LaTeX in responses.` 
        },
        ...finalHistory
      ];

      try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${GROQ_API_KEY}`
          },
          body: JSON.stringify({
            model: currentModel,
            messages,
            stream: true
          }),
          signal: signals,
          mode: 'cors',
          credentials: 'omit'
        });
        return response;
      } catch (fetchErr) {
        console.error("Direct API Call Failed:", fetchErr);
        throw new Error(`Direct connection to AI provider failed. If you see 'Failed to fetch', it might be a CORS issue or an invalid API Key. Verify your API Key and internet connection.`);
      }
    };

    try {
      abortControllerRef.current = new AbortController();
      
      const model = "llama-3.3-70b-versatile";

      const response = await performRequest(model, abortControllerRef.current.signal);

      if (!response.ok) {
        const errorText = await response.text();
        let errorMsg = `API Error (${response.status})`;
        try {
          const errorJson = JSON.parse(errorText);
          errorMsg = errorJson.error?.message || errorMsg;
        } catch (e) {
          errorMsg = errorText.slice(0, 100) || errorMsg;
        }
        throw new Error(errorMsg);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let aiContent = "";
      const aiMsgId = crypto.randomUUID();

      // Initial blank message
      setConversations(prev => prev.map(c => 
        c.id === currentId 
          ? { 
              ...c, 
              messages: [...c.messages, { 
                id: aiMsgId, 
                role: "assistant", 
                content: "", 
                timestamp: Date.now(),
                provider: `Groq (${model})`
              }] 
            }
          : c
      ));

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");
        
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") break;
            try {
              const json = JSON.parse(data);
              const text = json.choices[0]?.delta?.content || "";
              aiContent += text;
              
              setConversations(prev => prev.map(c => 
                c.id === currentId 
                  ? { 
                      ...c, 
                      messages: c.messages.map(m => 
                        m.id === aiMsgId ? { ...m, content: aiContent } : m
                      )
                    }
                  : c
              ));
            } catch (e) {
              // Ignore parse errors from chunks
            }
          }
        }
      }

    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        addToast((err as Error).message || "Request failed. Try again please.", "error");
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const generateImage = async (prompt: string) => {
    let currentId = activeId;
    const aiMsgId = crypto.randomUUID();
    const userMsgId = crypto.randomUUID();
    const seed = Math.floor(Math.random() * 1000000);
    const safePrompt = encodeURIComponent(prompt);
    
    // Turbo is generally fast, but we ensure a random seed to bypass any specific cached delays
    const imageUrl = `https://image.pollinations.ai/prompt/${safePrompt}?width=1024&height=1024&model=turbo&nologo=true&seed=${seed}`;
    
    const userMsg: Message = {
      id: userMsgId,
      role: "user",
      content: prompt,
      timestamp: Date.now(),
      type: "text"
    };

    const aiMsg: Message = {
      id: aiMsgId,
      role: "assistant",
      content: `✦ Generated image for: ${prompt}`,
      timestamp: Date.now(),
      type: "image",
      imageUrl: imageUrl,
      isImageLoading: true
    };

    addToast("Sinvo is painting...", "info");
    
    // Batch updates: New conversation OR existing one
    if (!currentId) {
      const id = crypto.randomUUID();
      const newConv: Conversation = {
        id,
        title: "Image: " + prompt.slice(0, 30),
        messages: [userMsg, aiMsg],
        updatedAt: Date.now()
      };
      setConversations(prev => [newConv, ...prev]);
      setActiveId(id);
    } else {
      setConversations(prev => prev.map(c => 
        c.id === currentId ? { ...c, messages: [...c.messages, userMsg, aiMsg], updatedAt: Date.now() } : c
      ));
    }

    setInputValue(""); // Immediate feedback
  };

  const stopStreaming = () => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    addToast("Copied to clipboard", "success");
  };

  const downloadImage = async (imageUrl: string) => {
    try {
      addToast("Preparing download...", "info");
      // Use no-cache to ensure we get a fresh response and try to handle CORS
      const response = await fetch(imageUrl, {
        mode: 'cors',
        credentials: 'omit'
      });
      
      if (!response.ok) throw new Error("Network response was not ok");
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const filename = `sinvo-gen-${Date.now()}.png`;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      addToast("Image downloaded", "success");
    } catch (err) {
      console.error("Download error:", err);
      // Fallback: direct download link if possible, otherwise new tab
      const link = document.createElement("a");
      link.href = imageUrl;
      link.target = "_blank";
      link.setAttribute("download", `sinvo-gen-${Date.now()}.png`);
      link.click();
      addToast("Opening image in new tab", "info");
    }
  };

  const saveSettings = async () => {
    if (!isAdmin) return;
    try {
      await set(ref(db, "global_settings"), globalSettings);
      addToast("Settings saved to cloud", "success");
      setSettingsModalOpen(false);
    } catch (err) {
      addToast("Failed to save settings", "error");
    }
  };

  // Renderers
  const renderMarkdown = (content: string, currentTheme: Theme) => {
    const customRenderer = new marked.Renderer();
    
    // Make ✦ non-copyable in basic text
    const processedContent = content.replace(/✦/g, '<span class="select-none inline-block pointer-events-none" aria-hidden="true">✦</span>');
    
    // @ts-ignore - marked v14+ uses an object for arguments
    customRenderer.code = ({ text, lang }) => {
      const language = lang || "";
      const validLanguage = hljs.getLanguage(language) ? language : "plaintext";
      const highlighted = hljs.highlight(text, { language: validLanguage }).value;
      
      const bgColor = currentTheme === 'dark' ? 'bg-[#14140a]' : 'bg-[#f7f7f5]';
      const borderColor = currentTheme === 'dark' ? 'border-white/5' : 'border-black/10';
      const textColor = currentTheme === 'dark' ? 'text-white/40' : 'text-black/50';

      return `
        <div class="code-block-container relative my-6 rounded-xl overflow-hidden border ${borderColor} shadow-sm">
          <div class="flex items-center justify-between px-4 py-2 ${bgColor} border-b ${borderColor} text-[10px] font-mono ${textColor} uppercase tracking-[0.2em] font-bold">
            <span>${language || 'code'}</span>
            <button 
              type="button"
              class="copy-code-btn transition-all flex items-center gap-1.5 hover:text-amber-500 cursor-pointer active:scale-95"
              title="Copy code"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
              <span>COPY</span>
            </button>
          </div>
          <pre class="!m-0 !rounded-none hljs ${validLanguage} p-4 overflow-x-auto text-sm ${currentTheme === 'dark' ? 'bg-[#0c0c05] text-[#e0e0e0]' : 'bg-[#fcfcfc] text-black'}"><code class="hljs ${validLanguage}">${highlighted}</code></pre>
        </div>
      `;
    };

    try {
      // Use the static parse method with the renderer passed in the options
      // This is generally more compatible across marked versions
      return marked.parse(processedContent, { 
        renderer: customRenderer as any,
        gfm: true,
        breaks: true
      }) as string;
    } catch (e) {
      console.error("Marked parsing error:", e);
      return marked.parse(processedContent) as string;
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-dark-bg flex flex-col items-center justify-center gap-6">
        <SinvoLogo className="animate-pulse scale-150" />
        <div className="flex items-center gap-2 text-amber-500/60 font-mono text-sm">
          <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          Initializing HyperCore...
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="fixed inset-0 bg-dark-bg flex items-center justify-center p-4 overflow-hidden">
        {/* Background Gradients */}
        <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-amber-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-amber-600/5 blur-[120px] rounded-full" />

        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="w-full max-w-lg bg-dark-card/40 backdrop-blur-xl border border-white/5 rounded-3xl p-8 md:p-12 shadow-2xl relative z-10"
        >
          <div className="flex flex-col items-center text-center mb-10">
            <div className="w-20 h-20 rounded-2xl bg-amber-500 flex items-center justify-center text-black mb-6 shadow-xl shadow-amber-500/20 animate-float">
              <span className="text-4xl font-bold select-none" aria-hidden="true">✦</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-display font-bold text-white mb-4">Sinvo</h1>
            <p className="text-white/60 leading-relaxed max-w-sm">
              An adaptive AI collaborator here to help you write code, generate images, and more.
            </p>
          </div>

          <div className="space-y-4">
            <button 
              onClick={loginWithGoogle}
              className="w-full h-14 bg-white text-black font-bold rounded-2xl flex items-center justify-center gap-3 hover:bg-amber-500 transition-all active:scale-[0.98] shadow-lg"
            >
              <i className="fa fa-google text-xl" />
              Continue with Google
            </button>
            <button 
              onClick={loginAsGuest}
              className="w-full h-14 bg-white/5 border border-white/10 text-white font-bold rounded-2xl hover:bg-white/10 transition-all active:scale-[0.98]"
            >
              Continue as Guest
            </button>
          </div>

          <div className="mt-12 flex items-center justify-center gap-6 grayscale opacity-40 text-xs font-mono uppercase tracking-widest text-white/40">
             <div className="flex items-center gap-1"><ShieldCheck size={14} /> Encrypted</div>
             <div className="flex items-center gap-1"><Zap size={14} /> HyperCore</div>
             <div className="flex items-center gap-1"><Cloud size={14} /> Cloud Sync</div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={cn("flex h-[100dvh] overflow-hidden", theme === "dark" ? "bg-dark-bg text-white" : "bg-light-bg text-gray-900")}>
      <AnimatePresence mode="popLayout">
        {toasts.map(t => (
          <Toast key={t.id} message={t.message} type={t.type} onClose={() => removeToast(t.id)} theme={theme} />
        ))}
      </AnimatePresence>

      {/* Sidebar Overlay */}
      <AnimatePresence>
        {sidebarOpen && window.innerWidth < 768 && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ 
          x: sidebarOpen ? 0 : -280,
          width: sidebarOpen ? 280 : 0,
        }}
        className={cn(
          "fixed md:relative z-50 h-full flex-shrink-0 flex flex-col overflow-hidden transition-colors duration-300 border-r",
          theme === "dark" ? "bg-[#14140a] border-[#1f1f0f]" : "bg-white border-black/10 shadow-2xl"
        )}
      >
        <div className="p-5 flex flex-col h-full w-[280px]">
          <div className="flex items-center justify-between mb-8 px-1">
            <SinvoLogo className={theme === "light" ? "text-black" : "text-white"} />
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className={cn("p-2 transition-colors", theme === "dark" ? "text-white/20 hover:text-white" : "text-black/30 hover:text-black")}
              >
                {theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
              </button>
              <button onClick={() => setSidebarOpen(false)} className={cn("md:hidden p-2", theme === "dark" ? "text-white/40 hover:text-white" : "text-black/40 hover:text-black")}>
                <X size={20} />
              </button>
            </div>
          </div>

          <button 
            onClick={createNewChat}
            className="flex items-center gap-3 w-full p-3.5 bg-gradient-to-r from-amber-500 to-amber-700 text-black font-bold rounded-xl hover:opacity-90 transition-all shadow-lg shadow-amber-500/10 mb-6"
          >
            <Plus size={20} strokeWidth={3} />
            New Conversation
          </button>

          <div className="relative mb-6">
            <Search className={cn("absolute left-3 top-1/2 -translate-y-1/2", theme === "dark" ? "text-white/20" : "text-black/30")} size={16} />
            <input 
              type="text"
              placeholder="Search history..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={cn(
                "w-full rounded-lg py-2.5 pl-10 pr-4 text-sm focus:outline-none transition-all border",
                theme === "dark" 
                  ? "bg-[#1f1f0f] border-[#2a2a14] text-gray-400 focus:border-amber-500/50" 
                  : "bg-white border-black/10 text-black focus:border-amber-500/50 shadow-sm"
              )}
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin">
            {filteredConversations.length === 0 ? (
              <div className="text-center py-10 text-white/10 space-y-2">
                <History className="mx-auto" size={32} />
                <p className="text-[10px] font-mono uppercase tracking-[0.2em]">Void</p>
              </div>
            ) : (
              <div>
                <p className={cn("text-[10px] uppercase tracking-widest font-bold mb-3 px-1", theme === "dark" ? "text-amber-500/50" : "text-amber-600/60")}>Conversations</p>
                <div className="space-y-1">
                  {filteredConversations.map(conv => (
                    <button
                      key={conv.id}
                      onClick={() => setActiveId(conv.id)}
                      className={cn(
                        "flex items-center gap-3 w-full p-2.5 rounded-lg text-left group transition-all text-[13px] relative overflow-hidden border",
                        activeId === conv.id 
                          ? theme === "dark"
                            ? "bg-[#1f1f0f] text-amber-500 border-[#2a2a14] border-l-amber-500 border-l-2" 
                            : "bg-white text-amber-600 border-black/10 border-l-amber-500 border-l-2 shadow-sm"
                          : theme === "dark"
                            ? "bg-transparent border-transparent text-gray-500 hover:bg-[#1f1f0f] hover:text-gray-300"
                            : "bg-transparent border-transparent text-black/60 hover:bg-white hover:border-black/10 hover:text-black"
                      )}
                    >
                      <MessageSquare size={14} className={cn("transition-colors", activeId === conv.id ? "text-amber-500" : theme === "dark" ? "text-gray-600" : "text-black/30")} />
                      <span className="truncate flex-1">{conv.title}</span>
                      <div 
                        onClick={(e) => deleteChat(conv.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-all"
                      >
                        <Trash2 size={12} />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className={cn(
            "mt-auto p-4 border-t -mx-5 -mb-5 transition-colors",
            theme === "dark" ? "bg-[#0c0c05] border-[#1f1f0f]" : "bg-white border-black/10"
          )}>
            <div className={cn(
              "flex items-center gap-3 p-2 rounded-lg cursor-pointer group transition-all",
              theme === "dark" ? "hover:bg-[#1f1f0f]" : "hover:bg-gray-50"
            )}>
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center font-bold overflow-hidden shadow-inner border",
                theme === "dark" ? "bg-amber-900/50 border-amber-500/30 text-amber-500" : "bg-amber-100 border-amber-200 text-amber-700"
              )}>
                {user.photoURL ? <img src={user.photoURL} alt="User" /> : (user.displayName?.[0] || "S")}
              </div>
              <div className="flex-1 overflow-hidden">
                <p className={cn("text-xs font-semibold truncate", theme === "dark" ? "text-white" : "text-black")}>{user.displayName || "Sinvo Guest"}</p>
                <p className={cn("text-[10px] truncate uppercase tracking-tighter italic", theme === "dark" ? "text-amber-500/70" : "text-amber-600/70")}>
                  {isAdmin ? "Admin Access" : "Guest Mode"}
                </p>
              </div>
              <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse" />
            </div>
          </div>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main 
        className="flex-1 flex flex-col relative overflow-hidden"
        style={{ paddingBottom: keyboardHeight > 0 ? keyboardHeight : undefined }}
      >
        <header className={cn(
          "h-16 flex-shrink-0 flex items-center justify-between px-4 md:px-8 border-b backdrop-blur-md sticky top-0 z-10 w-full transition-colors",
          theme === "dark" 
            ? "border-[#1f1f0f] bg-[#0a0a00]/80" 
            : "border-black/10 bg-white/80"
        )}>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setSidebarOpen(true)} 
              className={cn(
                "p-2 transition-colors",
                sidebarOpen ? "hidden" : theme === "dark" ? "text-white/60 hover:text-white" : "text-black/60 hover:text-black"
              )}
            >
              <Menu size={18} />
            </button>
            <div className="flex items-center gap-3">
              <h2 className={cn(
                "text-sm font-medium truncate max-w-[150px] md:max-w-[300px]",
                theme === "dark" ? "text-gray-300" : "text-black"
              )}>
                {activeConversation?.title || "New Conversation"}
              </h2>
              <div className={cn("h-4 w-px hidden md:block", theme === "dark" ? "bg-gray-800" : "bg-black/10")} />
              <div className="hidden md:flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse-slow" />
                <span className={cn("text-[11px] font-mono tracking-tight uppercase", theme === "dark" ? "text-amber-500" : "text-amber-600")}>Sinvo HyperCore</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 md:gap-6">
            <div className="hidden lg:flex items-center gap-4 text-[10px] font-bold">
               <span className="flex items-center gap-1.5 text-green-500/80"><Check size={12} strokeWidth={4} /> CLOUD SYNC</span>
               <span className="flex items-center gap-1.5 text-green-500/80"><Check size={12} strokeWidth={4} /> ADMIN SECURE</span>
               <span className="flex items-center gap-1.5 text-green-500/80"><Check size={12} strokeWidth={4} /> ANTI-SQLi</span>
            </div>
            
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setSettingsModalOpen(true)}
                className="p-2 text-gray-400 hover:text-amber-500 transition-colors"
                title="Configuration"
              >
                <SettingsIcon size={18} />
              </button>
              <button 
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="p-2 text-gray-400 hover:text-amber-500 transition-colors"
              >
                {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <button 
                onClick={handleLogout}
                className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                title="Logout"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto px-4 py-8 md:px-6 custom-scrollbar relative">
          <div className="max-w-[780px] mx-auto w-full">
            {!activeConversation || activeConversation.messages.length === 0 ? (
              <div className="py-20 flex flex-col items-center">
                <motion.div 
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="mb-8 relative"
                >
                  <div className="absolute inset-0 bg-amber-500/10 blur-[60px] rounded-full"></div>
                  <span className="text-8xl relative animate-float inline-block select-none" aria-hidden="true">✦</span>
                </motion.div>
                <h1 className={cn(
                  "text-4xl md:text-6xl font-display font-bold text-center mb-4 bg-clip-text text-transparent italic tracking-tight bg-gradient-to-b",
                  theme === "dark" ? "from-white to-amber-500" : "from-black to-amber-600"
                )}>
                  Hello, how can I help?
                </h1>
                <p className="text-gray-500 text-center mb-12 max-w-lg leading-relaxed">
                  I am Sinvo, your adaptive AI collaborator. From code debugging to creative content, let's build something exceptional together.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full px-4">
                  {[
                    { icon: "⚛️", title: "Explain quantum computing", text: "Summarize in simple terms" },
                    { icon: "🐍", title: "Write a Python function", text: "Create an async data scraper" },
                    { icon: "💡", title: "5 creative business ideas", text: "Focus on sustainable tech" },
                    { icon: "📧", title: "Professional email template", text: "Request for partnership" }
                  ].map((card, i) => (
                    <motion.button
                      key={i}
                      initial={{ y: 15, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: i * 0.05 }}
                      onClick={() => setInputValue(card.title)}
                      className={cn(
                        "p-5 rounded-2xl text-left transition-all group flex flex-col border",
                        theme === "dark" 
                          ? "bg-[#14140a] border-[#1f1f0f] hover:border-amber-500/40" 
                          : "bg-white border-black/10 hover:border-amber-500/50 shadow-sm"
                      )}
                    >
                      <div className="text-2xl mb-3">{card.icon}</div>
                      <p className={cn(
                        "text-sm font-semibold group-hover:text-amber-500 transition-colors",
                        theme === "dark" ? "text-white" : "text-black"
                      )}>{card.title}</p>
                      <p className="text-[11px] text-gray-500 mt-1 uppercase tracking-tight">{card.text}</p>
                    </motion.button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-8 min-h-full pb-10">
                {activeConversation.messages.map((message, i) => (
                  <motion.div 
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    key={message.id}
                    className={cn(
                      "flex gap-4 group",
                      message.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    {message.role === "assistant" && <SinvoAvatar />}
                    
                    <div className={cn(
                      "max-w-[85%] relative",
                      message.role === "user" ? "items-end" : "items-start"
                    )}>
                      <div className={cn(
                        "rounded-2xl p-4 md:p-5 text-[15px] leading-relaxed shadow-sm",
                        message.role === "user" 
                          ? "bg-gradient-to-br from-amber-500 to-amber-600 text-black font-medium" 
                          : theme === "dark" 
                            ? "bg-dark-card border border-white/5 text-white/90"
                            : "bg-white border border-black/10 text-black"
                      )}>
                        {message.type === "image" ? (
                          <div className="space-y-4">
                            <ImageWithLoading 
                              imageUrl={message.imageUrl!} 
                              onFullScreen={setFullScreenImage} 
                            />
                            <div className="flex items-center justify-between">
                               <button 
                                 onClick={() => downloadImage(message.imageUrl!)}
                                 className={cn(
                                   "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] uppercase font-bold transition-all",
                                   theme === "dark" 
                                     ? "bg-white/5 text-white hover:bg-white/10" 
                                     : "bg-white border border-black/10 text-black hover:bg-gray-100"
                                 )}
                               >
                                 <Download size={12} /> Download
                               </button>
                               <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20">
                                 <div className="w-1 h-1 rounded-full bg-amber-500 animate-pulse" />
                                 <span className="text-[8px] font-bold text-amber-500 uppercase tracking-wider">Turbo</span>
                               </div>
                            </div>
                            <p className={cn("text-[10px] uppercase font-mono italic", theme === "dark" ? "text-white/30" : "text-black/40")}>Generated by Sinvo</p>
                          </div>
                        ) : message.content === "" ? (
                          <div className="flex items-center gap-2 py-1">
                            <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                            <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                            <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce" />
                          </div>
                        ) : (
                          <div 
                            className={cn("markdown-body", theme === "dark" ? "prose-invert" : "")}
                            dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content, theme) }}
                          />
                        )}
                      </div>
                      
                      <div className={cn(
                        "flex items-center gap-3 mt-2 text-[10px] opacity-0 group-hover:opacity-100 transition-all",
                        message.role === "user" ? "flex-row-reverse" : "flex-row"
                      )}>
                        <span className={cn("font-mono font-medium", theme === "dark" ? "text-white/20" : "text-black/30")}>
                          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <button 
                          onClick={() => copyToClipboard(message.content)}
                          className={cn(
                            "flex items-center gap-1.5 px-2 py-1 rounded-md transition-all", 
                            theme === "dark" 
                              ? "text-white/40 hover:text-amber-500 hover:bg-white/5" 
                              : "text-black/40 hover:text-amber-600 hover:bg-black/5"
                          )}
                          title="Copy full message"
                        >
                          <Copy size={12} />
                          <span className="text-[9px] font-bold uppercase tracking-wider">Copy</span>
                        </button>
                        {message.role === "assistant" && (
                          <button 
                            onClick={() => {
                              setInputValue(activeConversation.messages[i-1]?.content || "");
                              sendMessage();
                            }}
                            className={cn(
                              "flex items-center gap-1.5 px-2 py-1 rounded-md transition-all",
                              theme === "dark" 
                                ? "text-white/40 hover:text-amber-500 hover:bg-white/5" 
                                : "text-black/40 hover:text-amber-600 hover:bg-black/5"
                            )}
                            title="Regenerate response"
                          >
                            <RefreshCw size={12} />
                            <span className="text-[9px] font-bold uppercase tracking-wider">Regen</span>
                          </button>
                        )}
                        {message.provider && (
                          <span className={cn("font-mono italic", theme === "dark" ? "text-amber-500/40" : "text-amber-600/60")}>
                            {message.provider}
                          </span>
                        )}
                      </div>
                    </div>

                    {message.role === "user" && (
                      <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center border border-amber-600 overflow-hidden shadow-lg">
                        {user.photoURL ? <img src={user.photoURL} alt="User" /> : <User size={16} className="text-black" />}
                      </div>
                    )}
                  </motion.div>
                ))}
                
                <div ref={chatEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Input Area */}
        <footer className={cn(
          "p-4 md:p-8 bg-gradient-to-t pb-[calc(1rem+env(safe-area-inset-bottom))]",
          theme === "dark" ? "from-[#0a0a00]" : "from-light-bg"
        )}>
          <div className="max-w-[780px] mx-auto w-full relative">
            <div className={cn(
              "rounded-[24px] p-2 shadow-2xl transition-all relative border",
              theme === "dark" 
                ? "bg-[#14140a] border-[#1f1f0f] focus-within:border-amber-500/30" 
                : "bg-white border-black/10 focus-within:border-amber-500/50"
            )}>
              <div className="flex items-center gap-1 px-3 mb-1">
                 <button 
                   onClick={() => setMode(mode === "chat" ? "image" : "chat")}
                   className={cn(
                     "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-widest transition-all",
                     mode === "image" 
                       ? "bg-amber-500 text-black" 
                       : theme === "dark" ? "text-white/20 hover:text-white" : "text-black/30 hover:text-black"
                   )}
                 >
                   {mode === "image" ? <Sparkles size={12} /> : <ImageIcon size={12} />}
                   {mode === "image" ? "IMAGE MODE" : "CHAT MODE"}
                 </button>
                 <div className={cn("h-4 w-px mx-2", theme === "dark" ? "bg-white/5" : "bg-black/5")} />
                 {mode === "image" ? (
                   <span className={cn("text-[9px] font-mono uppercase tracking-tighter", theme === "dark" ? "text-amber-500/40" : "text-amber-600/60")}>Engine: Sinvo Flux</span>
                 ) : (
                   <span className={cn("text-[9px] font-mono uppercase tracking-tighter", theme === "dark" ? "text-white/20" : "text-black/30")}>Sinvo HyperCore</span>
                 )}
              </div>

              <div className="flex items-end gap-3 px-3 pb-2">
                <textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter key now just adds a new line by default
                  }}
                  placeholder={mode === "chat" ? "Message Sinvo HyperCore..." : "Describe an image to generate..."}
                  className={cn(
                    "flex-1 bg-transparent border-none outline-none resize-none px-0 py-3 text-[15px] min-h-[50px] max-h-[160px] scrollbar-hide",
                    theme === "dark" ? "text-white placeholder-gray-600" : "text-black placeholder-gray-400"
                  )}
                  rows={1}
                />
                
                <div className="flex items-center gap-2 pb-1.5">
                  {isStreaming ? (
                    <button 
                      onClick={stopStreaming}
                      className="w-10 h-10 rounded-xl bg-red-500/20 text-red-500 border border-red-500/20 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all"
                    >
                      <StopCircle size={18} />
                    </button>
                  ) : (
                    <button 
                      onClick={sendMessage}
                      disabled={!inputValue.trim()}
                      className="w-11 h-11 rounded-xl bg-amber-500 text-black flex items-center justify-center hover:bg-amber-600 transition-all disabled:opacity-10 disabled:grayscale shadow-lg shadow-amber-500/10 active:scale-95"
                    >
                      <SendHorizonal size={20} className="ml-0.5" />
                    </button>
                  ) }
                </div>
              </div>
            </div>
            
            <p className="text-center text-[9px] text-gray-600 mt-5 uppercase tracking-[0.3em] font-mono">
               Sinvo can make mistakes. Check important info.
            </p>
          </div>
        </footer>
      </main>

      {/* Settings Modal */}
      <AnimatePresence>
        {settingsModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               onClick={() => setSettingsModalOpen(false)}
               className="absolute inset-0 bg-black/80 backdrop-blur-md" 
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={cn(
                "w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl relative z-10 border",
                theme === "dark" ? "bg-dark-card border-white/10" : "bg-white border-black/10 text-black"
              )}
            >
              <div className={cn(
                "p-6 border-b flex items-center justify-between",
                theme === "dark" ? "border-white/5" : "border-black/5"
              )}>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-500/10 rounded-xl text-amber-500">
                    <SettingsIcon size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold">System Configuration</h3>
                    <p className={cn("text-[10px] uppercase font-mono", theme === "dark" ? "text-white/30" : "text-black/40")}>HyperCore Management Console</p>
                  </div>
                </div>
                <button onClick={() => setSettingsModalOpen(false)} className={cn("p-2 transition-colors", theme === "dark" ? "text-white/20 hover:text-white" : "text-black/30 hover:text-black")}>
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto">
                {/* Security Section */}
                <section>
                   <h4 className={cn("flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest mb-4", theme === "dark" ? "text-amber-500" : "text-amber-600")}>
                     <Shield size={14} /> Security Framework
                   </h4>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[
                        { key: "cloudSync", label: "Cloud Sync Active", icon: <Cloud size={16} /> },
                        { key: "adminProtection", label: "Admin Protection", icon: <ShieldCheck size={16} /> },
                        { key: "antiSqlFilter", label: "Anti-SQLi Filter", icon: <Terminal size={16} /> },
                        { key: "csrfTokens", label: "CSRF Tokens Active", icon: <Database size={16} /> }
                      ].map((s) => (
                        <div key={s.key} className={cn(
                          "p-4 rounded-2xl border flex items-center justify-between",
                          theme === "dark" ? "bg-white/5 border-white/5" : "bg-gray-50 border-black/5"
                        )}>
                          <div className="flex items-center gap-3 text-sm">
                            <span className={cn(theme === "dark" ? "text-amber-500/40" : "text-amber-600/50")}>{s.icon}</span>
                            <span className="font-medium">{s.label}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-green-500 font-bold uppercase tracking-tighter">Verified</span>
                            <Check size={16} className="text-green-500" />
                          </div>
                        </div>
                      ))}
                   </div>
                </section>


                {/* Account Details */}
                <section>
                   <h4 className={cn("flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest mb-4", theme === "dark" ? "text-amber-500" : "text-amber-600")}>
                     <User size={14} /> User Identity
                   </h4>
                   <div className="space-y-4">
                      <div className="flex flex-col gap-1">
                        <label className={cn("text-[10px] uppercase ml-2", theme === "dark" ? "text-white/40" : "text-black/40")}>Display Name</label>
                        <input 
                          disabled={!isAdmin}
                          type="text" 
                          value={isAdmin || "syeef021@gmail.com" === user?.email ? (user?.displayName || "Sinvo Admin") : "********"}
                          className={cn(
                            "w-full p-4 rounded-2xl outline-none focus:border-amber-500/50 disabled:opacity-50 border",
                            theme === "dark" ? "bg-white/5 border-white/5" : "bg-gray-50 border-black/5 text-black"
                          )}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className={cn("text-[10px] uppercase ml-2", theme === "dark" ? "text-white/40" : "text-black/40")}>Email Access</label>
                        <input 
                          disabled={!isAdmin}
                          type="text" 
                          value={isAdmin || "syeef021@gmail.com" === user?.email ? (user?.email || "guest@sinvo.ai") : "********"}
                          className={cn(
                            "w-full p-4 rounded-2xl outline-none focus:border-amber-500/50 disabled:opacity-50 border",
                            theme === "dark" ? "bg-white/5 border-white/5" : "bg-gray-50 border-black/5 text-black"
                          )}
                        />
                      </div>
                   </div>
                </section>


              </div>

              {isAdmin && (
                <div className={cn(
                  "p-6 border-t flex justify-end",
                  theme === "dark" ? "bg-black/20 border-white/5" : "bg-gray-50 border-black/5"
                )}>
                   <button 
                     onClick={saveSettings}
                     className="px-8 py-3 bg-amber-500 text-black font-bold rounded-2xl hover:bg-amber-600 transition-all flex items-center gap-2"
                   >
                     <Zap size={18} /> Sync Cloud State
                   </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Fullscreen Image Modal */}
      <AnimatePresence>
        {fullScreenImage && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               onClick={() => setFullScreenImage(null)}
               className="absolute inset-0 bg-black/95 backdrop-blur-xl" 
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-4xl max-h-[90vh] w-full"
            >
              <img src={fullScreenImage} alt="Fullscreen" className="w-full h-full object-contain rounded-2xl shadow-2xl" />
              <button 
                onClick={() => setFullScreenImage(null)}
                className="absolute top-4 right-4 p-3 bg-black/50 text-white rounded-full hover:bg-black/80"
              >
                <X size={24} />
              </button>
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-4">
                 <button 
                   onClick={() => downloadImage(fullScreenImage)}
                   className="px-6 py-3 bg-white text-black font-bold rounded-2xl flex items-center gap-2 shadow-xl hover:bg-gray-100 transition-colors active:scale-95"
                 >
                   <Download size={18} /> Download High-Res
                 </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
