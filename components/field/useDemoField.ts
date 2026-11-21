"use client";

import { useEffect, useState } from "react";
import type { FieldDTO } from "@/lib/field/types";
import type { FieldData } from "./useFieldData";

const NOOP = () => {};

/**
 * The demo's satellite view: bundled with the app (data/demo/field.json, made by `npm run snapshot:field`), so the
 * pitch needs no internet and no Copernicus keys. Loaded on demand: it is ~130 KB the farmer app never needs.
 */
export function useDemoField(): FieldData {
  const [field, setField] = useState<FieldDTO | null>(null);
  useEffect(() => {
    let alive = true;
    import("@/data/demo/field.json").then((m) => alive && setField(m.default as unknown as FieldDTO));
    return () => {
      alive = false;
    };
  }, []);
  return { status: field ? "ready" : "loading", field, savedAt: null, reload: NOOP };
}
