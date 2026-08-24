"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";

interface Pair {
  key: string;
  value: string;
}

function toPairs(record: Record<string, string> | undefined): Pair[] {
  const entries = Object.entries(record ?? {});
  return entries.length > 0 ? entries.map(([key, value]) => ({ key, value: String(value) })) : [{ key: "", value: "" }];
}

/**
 * Editor genérico de pares clave/valor para columnas JSONB de formato libre
 * (pricing_info, business_hours — ver migrator.ts). Serializa a un <input
 * type="hidden"> con el JSON completo, para que el <form> que lo contiene
 * lo mande junto con el resto de los campos via Server Action.
 */
export function KeyValueEditor({
  name,
  label,
  initialValue,
  keyPlaceholder,
  valuePlaceholder,
}: {
  name: string;
  label: string;
  initialValue?: Record<string, string>;
  keyPlaceholder: string;
  valuePlaceholder: string;
}) {
  const [pairs, setPairs] = useState<Pair[]>(() => toPairs(initialValue));

  const json = JSON.stringify(
    Object.fromEntries(pairs.filter((pair) => pair.key.trim() !== "").map((pair) => [pair.key.trim(), pair.value]))
  );

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <input type="hidden" name={name} value={json} />
      <div className="space-y-2">
        {pairs.map((pair, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              placeholder={keyPlaceholder}
              value={pair.key}
              onChange={(event) => {
                const next = [...pairs];
                next[index] = { ...next[index], key: event.target.value };
                setPairs(next);
              }}
            />
            <Input
              placeholder={valuePlaceholder}
              value={pair.value}
              onChange={(event) => {
                const next = [...pairs];
                next[index] = { ...next[index], value: event.target.value };
                setPairs(next);
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setPairs(pairs.filter((_, i) => i !== index))}
              aria-label="Quitar"
            >
              <X className="size-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => setPairs([...pairs, { key: "", value: "" }])}>
        <Plus className="size-4" />
        Agregar
      </Button>
    </div>
  );
}
