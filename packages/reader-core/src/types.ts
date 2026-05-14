export interface Chapter {
  id: string;
  bookId: string;
  title: string;
  href?: string;
  order: number;
  inToc?: boolean;
}
