import { expect, test } from "vite-plus/test";
import { parseOpdsFeed } from "./opds-parser";

const BASE = "http://books.example.com/catalog";

const EMPTY_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test Catalog</title>
</feed>`;

const NAV_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>OPDS Root</title>
  <link rel="subsection" href="/popular" title="Popular" />
  <link rel="http://opds-spec.org/subcollection" href="/new" title="New Releases" />
</feed>`;

const ENTRY_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:opds="http://opds-spec.org/2010/catalog">
  <title>Books</title>
  <entry>
    <title>The Hobbit</title>
    <author><name>J.R.R. Tolkien</name></author>
    <id>urn:isbn:9780007458424</id>
    <link rel="http://opds-spec.org/image" href="/covers/hobbit.jpg" type="image/jpeg" />
    <link rel="http://opds-spec.org/acquisition" href="/downloads/hobbit.epub" type="application/epub+zip" />
  </entry>
  <entry>
    <title>Dune</title>
    <author><name>Frank Herbert</name></author>
    <id>urn:isbn:9780441172719</id>
    <link rel="http://opds-spec.org/acquisition" href="/downloads/dune.epub" type="application/epub+zip" />
  </entry>
</feed>`;

const PAGINATED_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Large Catalog</title>
  <link rel="first" href="/catalog?page=1" />
  <link rel="next" href="/catalog?page=3" />
  <link rel="previous" href="/catalog?page=1" />
  <link rel="last" href="/catalog?page=10" />
  <entry>
    <title>Book 2</title>
    <author><name>Author</name></author>
    <id>book-2</id>
    <link rel="http://opds-spec.org/acquisition" href="/dl/book2.epub" type="application/epub+zip" />
  </entry>
</feed>`;

const RELATIVE_URL_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Relative</title>
  <link rel="subsection" href="subcat" title="Sub" />
  <entry>
    <title>Book</title>
    <author><name>Author</name></author>
    <id>book-1</id>
    <link rel="http://opds-spec.org/acquisition" href="downloads/book.epub" type="application/epub+zip" />
  </entry>
</feed>`;

const INVALID_XML = `not xml at all`;

const ENTRY_AS_NAV_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Mixed</title>
  <entry>
    <title>Sub Category</title>
    <id>sub-cat</id>
    <link rel="subsection" href="/sub" />
  </entry>
  <entry>
    <title>Actual Book</title>
    <author><name>Author</name></author>
    <id>book-1</id>
    <link rel="http://opds-spec.org/acquisition" href="/dl/book.epub" type="application/epub+zip" />
  </entry>
</feed>`;

test("parses empty feed", () => {
  const feed = parseOpdsFeed(EMPTY_FEED, BASE);
  expect(feed.title).toBe("Test Catalog");
  expect(feed.navLinks).toEqual([]);
  expect(feed.entries).toEqual([]);
});

test("parses navigation links", () => {
  const feed = parseOpdsFeed(NAV_FEED, BASE);
  expect(feed.title).toBe("OPDS Root");
  expect(feed.navLinks).toHaveLength(2);
  expect(feed.navLinks[0].title).toBe("Popular");
  expect(feed.navLinks[0].href).toBe("http://books.example.com/popular");
  expect(feed.navLinks[1].title).toBe("New Releases");
});

test("parses book entries", () => {
  const feed = parseOpdsFeed(ENTRY_FEED, BASE);
  expect(feed.entries).toHaveLength(2);

  expect(feed.entries[0].title).toBe("The Hobbit");
  expect(feed.entries[0].author).toBe("J.R.R. Tolkien");
  expect(feed.entries[0].downloadUrl).toBe("http://books.example.com/downloads/hobbit.epub");
  expect(feed.entries[0].format).toBe("application/epub+zip");
  expect(feed.entries[0].coverUrl).toBe("http://books.example.com/covers/hobbit.jpg");
  expect(feed.entries[0].formats).toHaveLength(1);
  expect(feed.entries[0].formats[0].url).toBe("http://books.example.com/downloads/hobbit.epub");

  expect(feed.entries[1].title).toBe("Dune");
  expect(feed.entries[1].author).toBe("Frank Herbert");
  expect(feed.entries[1].formats).toHaveLength(1);
});

test("parses multiple acquisition formats per entry", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <title>Book</title>
      <entry>
        <title>Moby Dick</title>
        <author><name>Melville</name></author>
        <id>moby</id>
        <link rel="http://opds-spec.org/acquisition" href="/dl/moby.epub" type="application/epub+zip" title="EPUB3" />
        <link rel="http://opds-spec.org/acquisition" href="/dl/moby.mobi" type="application/x-mobipocket-ebook" title="Kindle" />
        <link rel="http://opds-spec.org/acquisition" href="/dl/moby.pdf" type="application/pdf" title="PDF" />
      </entry>
    </feed>`;
  const feed = parseOpdsFeed(xml, BASE);
  expect(feed.entries).toHaveLength(1);
  expect(feed.entries[0].formats).toHaveLength(3);
  expect(feed.entries[0].formats[0]).toEqual({
    url: "http://books.example.com/dl/moby.epub",
    type: "application/epub+zip",
    label: "EPUB3",
  });
  expect(feed.entries[0].formats[2].label).toBe("PDF");
  // First format is still the "default"
  expect(feed.entries[0].downloadUrl).toBe("http://books.example.com/dl/moby.epub");
  expect(feed.entries[0].format).toBe("application/epub+zip");
});

test("parses pagination links", () => {
  const feed = parseOpdsFeed(PAGINATED_FEED, BASE);
  expect(feed.pagination.next).toBe("http://books.example.com/catalog?page=3");
  expect(feed.pagination.previous).toBe("http://books.example.com/catalog?page=1");
  expect(feed.pagination.first).toBe("http://books.example.com/catalog?page=1");
  expect(feed.pagination.last).toBe("http://books.example.com/catalog?page=10");
});

test("resolves relative URLs", () => {
  const feed = parseOpdsFeed(RELATIVE_URL_FEED, "http://books.example.com/catalog/root.xml");
  expect(feed.navLinks[0].href).toBe("http://books.example.com/catalog/subcat");
  expect(feed.entries[0].downloadUrl).toBe("http://books.example.com/catalog/downloads/book.epub");
});

test("throws on invalid XML", () => {
  expect(() => parseOpdsFeed(INVALID_XML, BASE)).toThrow("OPDS parse error");
});

test("treats entries with subsection link as nav links, not book entries", () => {
  const feed = parseOpdsFeed(ENTRY_AS_NAV_FEED, BASE);
  expect(feed.navLinks).toHaveLength(1);
  expect(feed.navLinks[0].title).toBe("Sub Category");
  expect(feed.navLinks[0].href).toBe("http://books.example.com/sub");
  expect(feed.entries).toHaveLength(1);
  expect(feed.entries[0].title).toBe("Actual Book");
});

test("entry without title falls back gracefully", () => {
  const xml = `<?xml version="1.0"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <title>T</title>
      <entry>
        <id>no-title</id>
        <link rel="http://opds-spec.org/acquisition" href="/dl/b.epub" type="application/epub+zip" />
      </entry>
    </feed>`;
  const feed = parseOpdsFeed(xml, BASE);
  expect(feed.entries[0].title).toBe("Untitled");
  expect(feed.entries[0].author).toBe("Unknown");
});
