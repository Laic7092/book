// Folder storage module

import type { Folder } from "../core/types";
import { STORES, dbPut, dbGet, dbGetAllFromIndex, dbDelete } from "./db";
import { generateId } from "../parsers/base";

export async function createFolder(name: string, order?: number): Promise<Folder> {
  const all = await getAllFolders();
  const folder: Folder = {
    id: generateId("folder"),
    name,
    createdAt: Date.now(),
    order: order ?? all.length,
  };
  await dbPut(STORES.FOLDERS, folder);
  return folder;
}

export async function getAllFolders(): Promise<Folder[]> {
  const folders = await dbGetAllFromIndex<Folder>(STORES.FOLDERS, "order");
  return folders;
}

export async function getFolder(id: string): Promise<Folder | undefined> {
  return dbGet<Folder>(STORES.FOLDERS, id);
}

export async function updateFolder(
  id: string,
  partial: Partial<Pick<Folder, "name" | "order">>,
): Promise<void> {
  const folder = await getFolder(id);
  if (!folder) return;
  Object.assign(folder, partial);
  await dbPut(STORES.FOLDERS, folder);
}

export async function deleteFolder(id: string): Promise<void> {
  await dbDelete(STORES.FOLDERS, id);
}
