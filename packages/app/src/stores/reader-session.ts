import { shallowRef } from "vue";
import type { ReaderSession } from "@book/reader-engine";

export const currentSession = shallowRef<ReaderSession | null>(null);
