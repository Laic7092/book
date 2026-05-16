import { shallowRef } from "vue";
import type { ReaderSession } from "@book/reader-host";

export const currentSession = shallowRef<ReaderSession | null>(null);
