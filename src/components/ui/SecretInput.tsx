"use client";

import { useState } from "react";

interface SecretInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function SecretInput({
  value,
  onChange,
  placeholder = "留空则不修改",
  disabled = false,
  className = "",
}: SecretInputProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 复制失败，静默处理
    }
  };

  return (
    <div className={`flex gap-2 ${className}`}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1 rounded-lg border border-[rgba(0,0,0,0.1)] px-3 py-2 text-sm"
      />
      {value && (
        <button
          type="button"
          onClick={handleCopy}
          disabled={disabled}
          className="shrink-0 rounded-lg border border-[rgba(0,0,0,0.1)] px-3 py-2 text-xs font-semibold bg-white cursor-pointer disabled:opacity-50"
        >
          {copied ? "已复制" : "复制"}
        </button>
      )}
    </div>
  );
}
