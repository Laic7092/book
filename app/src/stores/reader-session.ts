import { shallowRef } from "vue";
import type { ReaderSession } from "@book/engine";

export const currentSession = shallowRef<ReaderSession | null>(null);
