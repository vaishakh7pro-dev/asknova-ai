
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

const suggestions = [
  "Explain artificial intelligence simply",
  "Help me learn JavaScript",
  "Write a Python program",
  "Give me project ideas",
];

type Message = {
  role: "user" | "assistant";
  content: string;
};

type Chat = {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
};

type ChatRow = {
  id: string;
  title: string;
  messages: Message[];
  updated_at: string;
};

export default function Home() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [cloudError, setCloudError] = useState("");

  // Check the login session and listen for authentication changes.
  useEffect(() => {
    let active = true;

    async function checkSession() {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (!active) return;

        if (error || !data.session) {
          setUser(null);
          setAuthLoading(false);
          router.replace("/login");
          return;
        }

        setUser(data.session.user);
        setAuthLoading(false);
      } catch (error) {
        console.error("Session check failed:", error);

        if (!active) return;

        setUser(null);
        setAuthLoading(false);
        router.replace("/login");
      }
    }

    void checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;

      if (!session) {
        setUser(null);
        setChats([]);
        setActiveChatId(null);
        setReady(false);
        router.replace("/login");
      } else {
        setUser(session.user);
      }

      setAuthLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router]);

  // Load chat history for the authenticated user.
  useEffect(() => {
    // Capture the ID before entering the async function.
    // This prevents the "user is possibly null" TypeScript error.
    const userId = user?.id;

    if (!userId) return;

    let cancelled = false;

    async function loadChats() {
      setReady(false);
      setCloudError("");
      setChats([]);
      setActiveChatId(null);

      try {
        const { data, error } = await supabase
          .from("chats")
          .select("id, title, messages, updated_at")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false });

        if (error) throw error;
        if (cancelled) return;

        const rows = (data ?? []) as ChatRow[];

        const loadedChats: Chat[] = rows.map((row) => ({
          id: row.id,
          title: row.title,
          messages: Array.isArray(row.messages) ? row.messages : [],
          updatedAt: new Date(row.updated_at).getTime(),
        }));

        setChats(loadedChats);
      } catch (error) {
        console.error("Could not load cloud chats:", error);

        if (!cancelled) {
          setCloudError(
            "Saved chats could not be loaded. Check your Supabase connection, chats table, and RLS policies."
          );
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    void loadChats();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Save a conversation to Supabase.
  const saveChat = useCallback(async (chat: Chat, userId: string) => {
    const { error } = await supabase.from("chats").upsert(
      {
        id: chat.id,
        user_id: userId,
        title: chat.title,
        messages: chat.messages,
        updated_at: new Date(chat.updatedAt).toISOString(),
      },
      { onConflict: "id" }
    );

    if (error) {
      console.error("Could not save cloud chat:", error);
      setCloudError(
        "Chat changes could not be saved. Check your connection and Supabase policies."
      );
      return false;
    }

    setCloudError("");
    return true;
  }, []);

  function newChat() {
    if (loading || !ready) return;
    setActiveChatId(null);
    setQuestion("");
  }

  function openChat(id: string) {
    if (loading || !ready) return;
    setActiveChatId(id);
    setQuestion("");
  }

  // Send a message to Gemini and save the conversation.
  async function sendMessage(text = question) {
    const prompt = text.trim();

    if (!prompt || loading || !user || !ready) return;

    // Keep a non-null ID for all async operations below.
    const userId = user.id;

    const existingChat = chats.find(
      (chat) => chat.id === activeChatId
    );

    const chatId = existingChat?.id ?? crypto.randomUUID();
    const previousMessages = existingChat?.messages ?? [];

    const updatedMessages: Message[] = [
      ...previousMessages,
      { role: "user", content: prompt },
    ];

    const updatedChat: Chat = {
      id: chatId,
      title: existingChat?.title ?? prompt.slice(0, 40),
      messages: updatedMessages,
      updatedAt: Date.now(),
    };

    setChats((previous) => [
      updatedChat,
      ...previous.filter((chat) => chat.id !== chatId),
    ]);

    setActiveChatId(chatId);
    setQuestion("");
    setLoading(true);
    setCloudError("");

    try {
      await saveChat(updatedChat, userId);

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updatedMessages }),
      });

const data = await response.json();

if (!response.ok) {
  console.error("Gemini backend error:", {
    status: response.status,
    details: data,
  });

  throw new Error(
    typeof data.error === "string"
      ? data.error
      : `Gemini request failed with status ${response.status}.`
  );
}


      if (typeof data.answer !== "string") {
        throw new Error("The AI returned an invalid response.");
      }

      const finalChat: Chat = {
        ...updatedChat,
        messages: [
          ...updatedMessages,
          { role: "assistant", content: data.answer },
        ],
        updatedAt: Date.now(),
      };

      setChats((previous) =>
        previous.map((chat) =>
          chat.id === chatId ? finalChat : chat
        )
      );

      await saveChat(finalChat, userId);
    } catch (error) {
      console.error("Message request failed:", error);

      const errorMessage =
        error instanceof Error ? error.message : "Please try again.";

      const failedChat: Chat = {
        ...updatedChat,
        messages: [
          ...updatedMessages,
          {
            role: "assistant",
            content: `Error: ${errorMessage}`,
          },
        ],
        updatedAt: Date.now(),
      };

      setChats((previous) =>
        previous.map((chat) =>
          chat.id === chatId ? failedChat : chat
        )
      );

      await saveChat(failedChat, userId);
    } finally {
      setLoading(false);
    }
  }

  // Delete a conversation belonging to the current user.
  async function deleteChat(chatId: string) {
    const userId = user?.id;

    if (loading || !userId || !ready) return;

    const { error } = await supabase
      .from("chats")
      .delete()
      .eq("id", chatId)
      .eq("user_id", userId);

    if (error) {
      console.error("Could not delete chat:", error);
      setCloudError("Could not delete this chat. Please try again.");
      return;
    }

    setChats((previous) =>
      previous.filter((chat) => chat.id !== chatId)
    );

    if (activeChatId === chatId) {
      setActiveChatId(null);
    }

    setCloudError("");
  }

  // Sign out of the current account.
  async function logOut() {
    if (loading) {
      alert("Please wait for the current response to finish.");
      return;
    }

    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("Could not sign out:", error);
      alert("Could not sign out. Please try again.");
      return;
    }

    setUser(null);
    setChats([]);
    setActiveChatId(null);
    setReady(false);
    router.replace("/login");
  }

  const sortedChats = [...chats].sort(
    (a, b) => b.updatedAt - a.updatedAt
  );

  const activeChat =
    chats.find((chat) => chat.id === activeChatId) ?? null;

  const messages = activeChat?.messages ?? [];

  if (authLoading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#101114] text-white">
        <p className="text-sm text-gray-400">
          {authLoading
            ? "Checking your account..."
            : "Redirecting to login..."}
        </p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen bg-[#101114] text-white">
      <aside className="hidden w-72 shrink-0 flex-col border-r border-white/10 p-4 md:flex">
        <div className="mb-7 text-xl font-bold">
          <span className="text-violet-400">✳</span> AskNova AI
        </div>

        <button
          onClick={newChat}
          disabled={loading || !ready}
          className="rounded-xl border border-white/15 px-4 py-3 text-left text-sm hover:bg-white/10 disabled:opacity-50"
        >
          + New chat
        </button>

        <p className="mb-3 mt-7 text-xs uppercase tracking-widest text-gray-500">
          Chat history
        </p>

        <div className="flex-1 space-y-1 overflow-y-auto">
          {!ready ? (
            <p className="text-sm text-gray-500">
              Loading cloud chats...
            </p>
          ) : sortedChats.length === 0 ? (
            <p className="text-sm text-gray-500">
              Your conversations will appear here.
            </p>
          ) : (
            sortedChats.map((chat) => (
              <div
                key={chat.id}
                className="group flex items-center gap-1"
              >
                <button
                  onClick={() => openChat(chat.id)}
                  title={chat.title}
                  disabled={loading}
                  className={`min-w-0 flex-1 truncate rounded-lg px-3 py-2 text-left text-sm ${
                    activeChatId === chat.id
                      ? "bg-white/10 text-white"
                      : "text-gray-400 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {chat.title}
                </button>

                <button
                  aria-label={`Delete ${chat.title}`}
                  title="Delete chat"
                  disabled={loading}
                  onClick={() => void deleteChat(chat.id)}
                  className="rounded px-2 py-2 text-gray-500 hover:bg-red-500/20 hover:text-red-300 disabled:opacity-40"
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>

        <div className="mt-5 border-t border-white/10 pt-4">
          <p className="mb-2 truncate text-xs text-gray-400">
            Signed in as
          </p>

          <p
            className="truncate text-sm text-white"
            title={user.email ?? ""}
          >
            {user.email ?? "Your account"}
          </p>

          <button
            onClick={() => void logOut()}
            disabled={loading}
            className="mt-3 w-full rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
          >
            Log out
          </button>

          <p className="mt-3 text-xs text-gray-500">
            Your chats are saved to your account.
          </p>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4 md:px-8">
          <div className="min-w-0">
            <div className="font-semibold md:hidden">
              ✳ AskNova AI
            </div>

            <div className="hidden text-sm text-gray-400 md:block">
              Your AI assistant
            </div>

            <div className="mt-1 max-w-52 truncate text-xs text-gray-500 md:hidden">
              {user.email}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={newChat}
              disabled={loading || !ready}
              className="rounded-lg border border-white/15 px-3 py-2 text-xs hover:bg-white/10 disabled:opacity-50 md:hidden"
            >
              + New chat
            </button>

            <button
              onClick={() => void logOut()}
              disabled={loading}
              className="rounded-lg border border-white/15 px-3 py-2 text-xs hover:bg-white/10 disabled:opacity-50 md:hidden"
            >
              Log out
            </button>

            <div className="hidden rounded-full border border-white/10 px-3 py-1 text-xs text-gray-300 sm:block">
              AI Chat
            </div>
          </div>
        </header>

        {cloudError && (
          <div
            role="alert"
            className="mx-4 mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 md:mx-8"
          >
            {cloudError}
          </div>
        )}

        <div className="flex flex-1 flex-col overflow-y-auto px-4 py-8 md:px-10">
          {messages.length === 0 ? (
            <div className="m-auto w-full max-w-2xl">
              <div className="mb-3 text-center text-4xl text-violet-400">
                ✳
              </div>

              <h1 className="text-center text-3xl font-semibold md:text-4xl">
                What can I help you with?
              </h1>

              <p className="mt-4 text-center text-gray-400">
                Ask a question. Discover an idea. Learn something new.
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => void sendMessage(suggestion)}
                    disabled={!ready || loading}
                    className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-left text-sm text-gray-300 hover:border-violet-400/50 hover:bg-white/[0.07] disabled:opacity-50"
                  >
                    {suggestion}
                    <span className="float-right text-violet-400">
                      ↗
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
              {messages.map((message, index) => (
                <div
                  key={`${index}-${message.role}`}
                  className={`flex gap-3 ${
                    message.role === "user"
                      ? "justify-end"
                      : "justify-start"
                  }`}
                >
                  {message.role === "assistant" && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-violet-300">
                      ✳
                    </div>
                  )}

                  <div
                    className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm leading-7 ${
                      message.role === "user"
                        ? "bg-violet-600 text-white"
                        : "border border-white/10 bg-white/[0.04] text-gray-200"
                    }`}
                  >
                    {message.content}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="animate-pulse text-sm text-violet-300">
                  AskNova is thinking...
                </div>
              )}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-[#101114] px-4 pb-5 pt-3 md:px-8">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage();
            }}
            className="mx-auto flex max-w-3xl items-end gap-3 rounded-2xl border border-white/15 bg-[#191a20] p-3 shadow-xl focus-within:border-violet-400/60"
          >
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder="Message AskNova AI..."
              rows={2}
              className="max-h-40 min-h-12 flex-1 resize-y bg-transparent px-2 py-2 text-sm text-white outline-none placeholder:text-gray-500"
            />

            <button
              type="submit"
              disabled={loading || !question.trim() || !ready}
              className="rounded-xl bg-violet-600 px-4 py-3 text-sm font-medium hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Send ↑
            </button>
          </form>

          <p className="mt-3 text-center text-xs text-gray-500">
            AskNova AI can make mistakes. Verify important information.
          </p>
        </div>
      </section>
    </main>
  );
}
