import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { CheckCircle2, Clock, ExternalLink, KeyRound, LogOut, PlugZap, UserCircle } from "lucide-react";
import { DEFAULT_MODEL, getSettings, setSettings } from "../lib/settings";
import { formatDuration, getUsage } from "../lib/usage";
import type { ExtensionProfile, UsageStats } from "../lib/types";
import "./styles.css";

const APP_URL = "https://www.internhack.xyz/student/applications";

function sendMessage<T>(message: Record<string, unknown>): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}

function Popup() {
  const [profile, setProfile] = useState<ExtensionProfile | null>(null);
  const [status, setStatus] = useState("Checking connection...");
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [keySaved, setKeySaved] = useState(false);
  const [keyStatus, setKeyStatus] = useState("");

  const loadProfile = async () => {
    setStatus("Checking connection...");
    const result = await sendMessage<ExtensionProfile & { error?: string }>({ type: "GET_PROFILE" });
    if ("error" in result && result.error) {
      setProfile(null);
      setStatus("Not connected");
      return;
    }
    setProfile(result);
    setStatus("Connected");
  };

  useEffect(() => {
    void loadProfile();
    void getUsage().then(setUsage);
    void getSettings().then((settings) => {
      setKeySaved(Boolean(settings.openRouterApiKey));
      setModel(settings.openRouterModel);
    });
  }, []);

  const disconnect = async () => {
    await sendMessage({ type: "CLEAR_SESSION" });
    setProfile(null);
    setStatus("Disconnected");
  };

  const saveKey = async () => {
    if (!apiKey.trim() && !keySaved) {
      setKeyStatus("Enter your OpenRouter API key.");
      return;
    }
    await setSettings({
      ...(apiKey.trim() ? { openRouterApiKey: apiKey.trim() } : {}),
      openRouterModel: model,
    });
    setApiKey("");
    setKeySaved(true);
    setKeyStatus("Saved. Cover letters are ready to generate.");
  };

  return (
    <main>
      <header>
        <img src="/logo.png" alt="" />
        <div>
          <p>InternHack</p>
          <h1>Autofill</h1>
        </div>
      </header>

      {profile ? (
        <section className="card">
          <div className="status">
            <CheckCircle2 size={16} />
            <span>{status}</span>
          </div>
          <div className="profile">
            <UserCircle size={18} />
            <div>
              <strong>{profile.user.name}</strong>
              <span>{profile.user.email}</span>
            </div>
          </div>
          <div className="grid">
            <span>{profile.user.skills.length} skills</span>
            <span>{profile.user.resumes.length} resumes</span>
          </div>
          <button type="button" onClick={disconnect} className="secondary">
            <LogOut size={14} />
            Disconnect
          </button>
        </section>
      ) : (
        <section className="card">
          <div className="status muted">
            <PlugZap size={16} />
            <span>{status}</span>
          </div>
          <p className="hint">
            Open InternHack while signed in and the extension connects
            automatically. No token to copy.
          </p>
        </section>
      )}

      <section className="card">
        <div className="status muted">
          <Clock size={16} />
          <span>Time saved</span>
        </div>
        <p className="stat">{usage ? formatDuration(usage.secondsSaved) : "..."}</p>
        <p className="hint">
          {usage
            ? `${usage.fieldsFilled} fields filled, ${usage.coverLetters} cover letters, ${usage.applicationsTracked} applications tracked`
            : "Autofill a form to start counting."}
        </p>
      </section>

      <section className="card">
        <div className="status muted">
          <KeyRound size={16} />
          <span>OpenRouter {keySaved ? "connected" : "API key"}</span>
        </div>
        <p className="hint">
          Used to generate cover letters with AI. The key is stored in this browser only.
        </p>
        <input
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={keySaved ? "Key saved. Paste a new one to replace" : "sk-or-v1-..."}
          autoComplete="off"
        />
        <input
          type="text"
          value={model}
          onChange={(event) => setModel(event.target.value)}
          placeholder="Model"
        />
        <button type="button" onClick={saveKey}>
          Save key
        </button>
        {keyStatus && <p className="hint">{keyStatus}</p>}
        <a className="link" href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">
          Get an OpenRouter key
          <ExternalLink size={13} />
        </a>
      </section>

      <a className="link" href={APP_URL} target="_blank" rel="noreferrer">
        Open My Applications
        <ExternalLink size={13} />
      </a>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Popup />);
