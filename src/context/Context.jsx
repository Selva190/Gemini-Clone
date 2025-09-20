import { createContext, useState, useCallback, useMemo } from "react";
import runChat from "../config/gemini";

export const Context = createContext();

const ContextProvider = ({ children }) => {
  const [input, setInput] = useState("");
  const [recentPrompt, setRecentPrompt] = useState("");
  const [prevPrompts, setPrevPrompts] = useState([]);
  const [showResult, setShowResult] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resultData, setResultData] = useState("");
  

  // Helpers to format response: **bold** to <b> and preserve newlines
  const escapeHtml = (str) =>
    str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const formatResponseToHtml = (response) => {
    if (!response) return "";
    const segments = response.split("**");
    let html = "";
    for (let i = 0; i < segments.length; i++) {
      const safe = escapeHtml(segments[i]);
      html += i % 2 === 1 ? `<b>${safe}</b>` : safe;
    }
    // Also convert single asterisks to line breaks
    return html.replace(/\n/g, "<br/>").split("*").join("<br/>");
  };

  // Delay appending a character to the result data to simulate typing
  const delayPara = (index, nextWord) => {
    setTimeout(function () {
      setResultData((prev) => prev + nextWord);
    }, 2* index);
  };

  const onSent = useCallback(
    async (prompt) => {
      const effectivePrompt = (prompt ?? input).trim();
      if (!effectivePrompt) return;

      setLoading(true);
      setShowResult(true);
      setResultData("");

      try {
        let response;
        if (prompt !== undefined) {
          setRecentPrompt(prompt);
          response = await runChat(prompt);
        } else {
          setRecentPrompt(input);
          response = await runChat(input);
        }
        const html = formatResponseToHtml(response || "");
        let newResponse = "";
        const newResponseArray = html.split("");
        for (let i = 0; i < newResponseArray.length; i++) {
          const nextWord = newResponseArray[i];
          delayPara(i, nextWord + "");
        }
        if (prompt === undefined) {
          setPrevPrompts((prev) => [...prev, input]);
        }
      } catch (err) {
        console.error("onSent failed:", err);
        setResultData("An error occurred. Please try again.");
      } finally {
        setLoading(false);
        setInput("");
      }
    },
    [input]
  );

  const newChat = useCallback(() => {
    setLoading(false);
    setShowResult(false);
    setResultData("");
    setRecentPrompt("");
    setInput("");
  }, []);

  const contextValue = useMemo(
    () => ({
      prevPrompts,
      setPrevPrompts,
      onSent,
      newChat,
      setRecentPrompt,
      recentPrompt,
      showResult,
      setShowResult,
      loading,
      resultData,
      input,
      setInput,
      delayPara,
    }),
    [prevPrompts, onSent, newChat, recentPrompt, showResult, loading, resultData, input]
  );

  return <Context.Provider value={contextValue}>{children}</Context.Provider>;
};

export default ContextProvider;
