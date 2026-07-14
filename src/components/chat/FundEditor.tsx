"use client";

import { useState, useCallback } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface FundItem {
  fund_code: string;
  fund_name: string;
  weight_in_category?: number;
  allocation_pct_of_portfolio: number;
  recommendation_reason?: string;
  role_label?: string;
}

export interface PlanCategory {
  category: string;
  allocation_pct: number;
  items: FundItem[];
  structure_note?: string;
}

interface FundEditorProps {
  categories: PlanCategory[];
  onChange: (categories: PlanCategory[]) => void;
  saving: boolean;
  warnings: string[];
}

/* ------------------------------------------------------------------ */
/*  Lookup helper                                                      */
/* ------------------------------------------------------------------ */

async function lookupFund(code: string): Promise<{ ok: boolean; fund_name?: string; error?: string }> {
  const res = await fetch(`/api/funds/lookup?code=${code}`);
  const data = await res.json();
  return data;
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function FundRow({
  item,
  catIdx,
  fundIdx,
  onWeightChange,
  onDelete,
}: {
  item: FundItem;
  catIdx: number;
  fundIdx: number;
  onWeightChange: (catIdx: number, fundIdx: number, val: string) => void;
  onDelete: (catIdx: number, fundIdx: number) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-[rgba(0,0,0,0.04)] last:border-b-0 group">
      <span className="text-[12px] font-mono text-[#a09b96] w-[56px] shrink-0">
        {item.fund_code}
      </span>
      <span className="text-[13px] text-[#1f1a16] flex-1 truncate min-w-0">
        {item.fund_name}
      </span>
      <div className="flex items-center gap-1 shrink-0">
        <input
          type="number"
          min={0}
          max={100}
          step={0.1}
          value={item.allocation_pct_of_portfolio}
          onChange={(e) => onWeightChange(catIdx, fundIdx, e.target.value)}
          className="w-[56px] rounded-md border border-[rgba(0,0,0,0.15)] px-1.5 py-0.5 text-[13px] text-right focus:outline-none focus:border-[#0075de] focus:ring-1 focus:ring-[#0075de]"
        />
        <span className="text-[12px] text-[#a09b96]">%</span>
      </div>
      {confirmDelete ? (
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onDelete(catIdx, fundIdx)}
            className="text-[12px] text-[#dc2626] hover:text-[#b91c1c] font-semibold cursor-pointer bg-transparent border-0 px-1"
          >
            删除
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            className="text-[12px] text-[#a09b96] hover:text-[#615d59] cursor-pointer bg-transparent border-0 px-1"
          >
            取消
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="text-[12px] text-[#a09b96] hover:text-[#dc2626] cursor-pointer bg-transparent border-0 px-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        >
          删除
        </button>
      )}
    </div>
  );
}

function AddFundForm({
  catIdx,
  onAdd,
}: {
  catIdx: number;
  onAdd: (catIdx: number, fundCode: string, fundName: string, weight: number) => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [weight, setWeight] = useState("");
  const [looking, setLooking] = useState(false);
  const [lookupError, setLookupError] = useState("");

  const handleLookup = useCallback(async () => {
    if (!/^\d{6}$/.test(code)) {
      setLookupError("请输入 6 位数字基金代码");
      return;
    }
    setLooking(true);
    setLookupError("");
    try {
      const result = await lookupFund(code);
      if (result.ok && result.fund_name) {
        setName(result.fund_name);
        setLookupError("");
      } else {
        setLookupError(result.error || "未找到该基金");
      }
    } catch {
      setLookupError("查询失败，请重试");
    } finally {
      setLooking(false);
    }
  }, [code]);

  const handleAdd = () => {
    const w = parseFloat(weight);
    if (isNaN(w) || w <= 0) {
      setLookupError("请输入有效的权重");
      return;
    }
    if (!name) {
      setLookupError("请先查询基金代码");
      return;
    }
    onAdd(catIdx, code, name, w);
    setCode("");
    setName("");
    setWeight("");
    setLookupError("");
  };

  return (
    <div className="mt-2 p-2.5 rounded-lg bg-[#f8f7f6] border border-dashed border-[rgba(0,0,0,0.1)]">
      <p className="text-[12px] text-[#a09b96] mb-2 m-0">添加基金</p>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          placeholder="基金代码"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
            setLookupError("");
          }}
          maxLength={6}
          className="w-[80px] rounded-md border border-[rgba(0,0,0,0.15)] px-2 py-1 text-[13px] focus:outline-none focus:border-[#0075de] focus:ring-1 focus:ring-[#0075de]"
        />
        <button
          type="button"
          disabled={looking || code.length !== 6}
          onClick={handleLookup}
          className="rounded-md bg-white text-[#0075de] px-2.5 py-1 text-[13px] font-semibold border border-[#0075de]/30 cursor-pointer hover:bg-[#e8f2fd] disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          {looking ? "查询中…" : "查询"}
        </button>
        {name && (
          <span className="text-[13px] text-[#1f1a16] truncate max-w-[160px]">
            {name}
          </span>
        )}
        <div className="flex items-center gap-1">
          <input
            type="number"
            placeholder="权重"
            min={0}
            max={100}
            step={0.1}
            value={weight}
            onChange={(e) => {
              setWeight(e.target.value);
              setLookupError("");
            }}
            className="w-[56px] rounded-md border border-[rgba(0,0,0,0.15)] px-1.5 py-1 text-[13px] text-right focus:outline-none focus:border-[#0075de] focus:ring-1 focus:ring-[#0075de]"
          />
          <span className="text-[12px] text-[#a09b96]">%</span>
        </div>
        <button
          type="button"
          disabled={!name || !weight}
          onClick={handleAdd}
          className="rounded-md bg-[#0075de] text-white px-2.5 py-1 text-[13px] font-semibold border-0 cursor-pointer hover:bg-[#0063c0] disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          添加
        </button>
      </div>
      {lookupError && (
        <p className="text-[12px] text-[#dc2626] mt-1.5 mb-0">{lookupError}</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function FundEditor({
  categories,
  onChange,
  saving,
  warnings,
}: FundEditorProps) {
  const handleCategoryPctChange = (catIdx: number, raw: string) => {
    const val = parseFloat(raw);
    onChange(
      categories.map((c, i) =>
        i === catIdx ? { ...c, allocation_pct: isNaN(val) ? 0 : val } : c,
      ),
    );
  };

  const handleWeightChange = (catIdx: number, fundIdx: number, raw: string) => {
    const val = parseFloat(raw);
    onChange(
      categories.map((c, ci) =>
        ci === catIdx
          ? {
              ...c,
              items: c.items.map((item, fi) =>
                fi === fundIdx
                  ? { ...item, allocation_pct_of_portfolio: isNaN(val) ? 0 : val }
                  : item,
              ),
            }
          : c,
      ),
    );
  };

  const handleDeleteFund = (catIdx: number, fundIdx: number) => {
    onChange(
      categories.map((c, ci) =>
        ci === catIdx
          ? { ...c, items: c.items.filter((_, fi) => fi !== fundIdx) }
          : c,
      ),
    );
  };

  const handleAddFund = (catIdx: number, fundCode: string, fundName: string, weight: number) => {
    onChange(
      categories.map((c, ci) =>
        ci === catIdx
          ? {
              ...c,
              items: [
                ...c.items,
                {
                  fund_code: fundCode,
                  fund_name: fundName,
                  allocation_pct_of_portfolio: weight,
                },
              ],
            }
          : c,
      ),
    );
  };

  const totalWeight = categories.reduce(
    (s, c) => s + c.items.reduce((ss, item) => ss + item.allocation_pct_of_portfolio, 0),
    0,
  );

  return (
    <div className="max-h-[500px] overflow-y-auto pr-1 -mr-1">
      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="mb-3 rounded-lg bg-[#fef3c7] border border-[#f59e0b]/30 px-3 py-2">
          {warnings.map((w, i) => (
            <p key={i} className="text-[13px] text-[#92400e] m-0 mb-1 last:mb-0">
              ⚠ {w}
            </p>
          ))}
        </div>
      )}

      {/* Category list */}
      <div className="space-y-3">
        {categories.map((cat, catIdx) => (
          <div
            key={cat.category}
            className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white"
          >
            {/* Category header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-[rgba(0,0,0,0.06)] bg-[#f8f7f6] rounded-t-lg">
              <span className="text-[14px] font-semibold text-[#1f1a16] flex-1">
                {cat.category}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={cat.allocation_pct}
                  onChange={(e) => handleCategoryPctChange(catIdx, e.target.value)}
                  className="w-[56px] rounded-md border border-[rgba(0,0,0,0.15)] px-1.5 py-0.5 text-[13px] text-right font-semibold focus:outline-none focus:border-[#0075de] focus:ring-1 focus:ring-[#0075de]"
                />
                <span className="text-[12px] text-[#a09b96]">%</span>
              </div>
            </div>

            {/* Fund list */}
            <div className="px-3 py-1.5">
              {cat.items.length === 0 ? (
                <p className="text-[13px] text-[#a09b96] py-2 text-center m-0">
                  暂无基金，点击下方添加
                </p>
              ) : (
                cat.items.map((item, fundIdx) => (
                  <FundRow
                    key={item.fund_code}
                    item={item}
                    catIdx={catIdx}
                    fundIdx={fundIdx}
                    onWeightChange={handleWeightChange}
                    onDelete={handleDeleteFund}
                  />
                ))
              )}
            </div>

            {/* Add fund form */}
            <div className="px-3 pb-3">
              <AddFundForm catIdx={catIdx} onAdd={handleAddFund} />
            </div>
          </div>
        ))}
      </div>

      {/* Total weight indicator */}
      <div className="mt-3 flex items-center gap-2">
        <span className="text-[13px] text-[#a09b96]">基金总权重</span>
        <span
          className={`text-[14px] font-semibold ${
            Math.abs(totalWeight - 100) <= 0.5 ? "text-[#16a34a]" : "text-[#dc2626]"
          }`}
        >
          {totalWeight.toFixed(1)}%
        </span>
        {Math.abs(totalWeight - 100) > 0.5 && (
          <span className="text-[13px] text-[#dc2626]">
            建议总权重为 100%
          </span>
        )}
      </div>
    </div>
  );
}
