"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";

const typeLabels = {
  company: "公司",
  document: "文件",
  module: "模組",
  page: "頁面",
  report: "報表",
  setting: "設定"
};

export default function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("idle");
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);

  const trimmedQuery = useMemo(() => query.trim(), [query]);

  useEffect(() => {
    if (!trimmedQuery) {
      setResults([]);
      setStatus("idle");
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setStatus("loading");
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(trimmedQuery)}`, {
          signal: controller.signal
        });
        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error(payload.message || "Search failed");
        }

        setResults(payload.results || []);
        setStatus("ready");
      } catch (error) {
        if (error.name !== "AbortError") {
          setResults([]);
          setStatus("error");
        }
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [trimmedQuery]);

  useEffect(() => {
    function closeOnOutsideClick(event) {
      if (!wrapperRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  const hasQuery = Boolean(trimmedQuery);
  const showPanel = isOpen && hasQuery;

  function openResult(result) {
    if (!result?.href) {
      return;
    }

    window.location.href = result.href;
  }

  function onKeyDown(event) {
    if (event.key === "Escape") {
      setIsOpen(false);
      event.currentTarget.blur();
      return;
    }

    if (event.key === "Enter" && results.length > 0) {
      event.preventDefault();
      openResult(results[0]);
    }
  }

  return (
    <div className="global-search" ref={wrapperRef}>
      <label className="search-box" htmlFor="global-search">
        <Search size={17} strokeWidth={2.2} />
        <input
          id="global-search"
          autoComplete="off"
          value={query}
          placeholder="搜尋統編、公司、文件或報表..."
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={onKeyDown}
        />
      </label>

      {showPanel ? (
        <div className="search-results" role="listbox" aria-label="搜尋結果">
          {status === "loading" ? (
            <div className="search-empty">搜尋中...</div>
          ) : null}

          {status === "error" ? (
            <div className="search-empty">搜尋暫時無法使用</div>
          ) : null}

          {status === "ready" && results.length === 0 ? (
            <div className="search-empty">找不到符合的項目</div>
          ) : null}

          {results.map((result, index) => (
            <button
              className="search-result"
              key={`${result.href}-${result.title}-${index}`}
              role="option"
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => openResult(result)}
            >
              <span className="search-result-main">
                <strong>{result.title}</strong>
                <span>{result.subtitle}</span>
              </span>
              <span className="search-result-type">{typeLabels[result.type] || result.type}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
