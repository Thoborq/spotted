"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

const MONTHS = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

type Field = number | "";

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function parse(value: string | null): { day: Field; month: Field; year: Field } {
  if (!value) return { day: "", month: "", year: "" };
  const [y, m, d] = value.split("-").map(Number);
  return { day: d, month: m, year: y };
}

const selectClass =
  "appearance-none rounded-xl border border-border bg-surface py-3 text-[15px] text-foreground shadow-soft focus:outline-none focus:ring-2 focus:ring-accent-strong/40";

/**
 * Maintains day/month/year as independent local state (initialized once from
 * `value`) rather than re-deriving from it on every render. An incomplete
 * selection reports `null` upward, but must not erase the fields the user
 * already picked while the date is still incomplete.
 */
export default function BirthdatePicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (iso: string | null) => void;
}) {
  const initial = parse(value);
  const [day, setDay] = useState<Field>(initial.day);
  const [month, setMonth] = useState<Field>(initial.month);
  const [year, setYear] = useState<Field>(initial.year);

  function commit(next: { day: Field; month: Field; year: Field }) {
    if (next.day && next.month && next.year) {
      const clampedDay = Math.min(next.day, daysInMonth(next.year, next.month));
      onChange(
        `${next.year}-${String(next.month).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`,
      );
    } else {
      onChange(null);
    }
  }

  function handleDay(v: Field) {
    setDay(v);
    commit({ day: v, month, year });
  }

  function handleMonth(v: Field) {
    setMonth(v);
    commit({ day, month: v, year });
  }

  function handleYear(v: Field) {
    setYear(v);
    commit({ day, month, year: v });
  }

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 100 }, (_, i) => currentYear - i);
  const days = Array.from({ length: 31 }, (_, i) => i + 1);

  return (
    <div className="flex gap-2">
      <div className="relative w-[78px]">
        <select
          value={day}
          onChange={(e) => handleDay(e.target.value ? Number(e.target.value) : "")}
          className={`${selectClass} w-full px-3 text-center`}
        >
          <option value="">Tag</option>
          {days.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-foreground-tertiary"
        />
      </div>
      <div className="relative flex-1">
        <select
          value={month}
          onChange={(e) => handleMonth(e.target.value ? Number(e.target.value) : "")}
          className={`${selectClass} w-full px-3`}
        >
          <option value="">Monat</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-foreground-tertiary"
        />
      </div>
      <div className="relative w-[92px]">
        <select
          value={year}
          onChange={(e) => handleYear(e.target.value ? Number(e.target.value) : "")}
          className={`${selectClass} w-full px-3 text-center`}
        >
          <option value="">Jahr</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-foreground-tertiary"
        />
      </div>
    </div>
  );
}
