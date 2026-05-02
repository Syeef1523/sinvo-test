import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// Security Middleware: Simple SQLi and XSS protection
app.use((req, res, next) => {
  const body = JSON.stringify(req.body);
  const sqlKeywords = [/select\s+\*/i, /union\s+select/i, /drop\s+table/i, /insert\s+into/i];
  const xssKeywords = [/<script/i, /javascript:/i, /onload=/i];
  
  for (const kw of sqlKeywords) {
    if (kw.test(body)) {
      console.warn("Potential SQLi attempt detected");
      return res.status(403).json({ error: "Security filter: Potential malicious input detected (SQLi)." });
    }
  }
  for (const kw of xssKeywords) {
    if (kw.test(body)) {
      console.warn("Potential XSS attempt detected");
      return res.status(403).json({ error: "Security filter: Potential malicious input detected (XSS)." });
    }
  }
  next();
});

// API Routes
app.post("/api/chat", async (req, res) => {
  const { messages, model } = req.body;
  
  const apiKey = process.env.GROQ_API_KEY || "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";
  const apiUrl = "https://api.groq.com/openai/v1/chat/completions";
  
  if (!apiKey) {
    return res.status(500).json({ error: "API Key not configured on server." });
  }

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": process.env.APP_URL || "https://sinvo.ai",
        "X-Title": "Sinvo AI"
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        stream: true
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      return res.status(response.status).json(errorData);
    }

    // Set up headers for Server-Sent Events (SSE)
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Pipe the response stream
    response.body.pipe(res);

  } catch (error) {
    console.error("Chat API Error:", error);
    res.status(500).json({ error: "Failed to communicate with AI provider." });
  }
});

// Admin verification for email
app.post("/api/admin/verify", (req, res) => {
  const { email } = req.body;
  if (email === "syeef021@gmail.com") {
    return res.json({ isAdmin: true });
  }
  res.json({ isAdmin: false });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Sinvo Server running on http://localhost:${PORT}`);
  });
}

startServer();
