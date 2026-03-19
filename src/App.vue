<script setup lang="ts">
import { ref } from "vue";
import Bookshelf from "./components/Bookshelf.vue";
import ReaderView from "./components/ReaderView.vue";
import type { Book } from "./core/types";

const currentBook = ref<Book | null>(null);

function handleBookSelect(book: Book) {
  currentBook.value = book;
}

function handleCloseReader() {
  currentBook.value = null;
}
</script>

<template>
  <div class="app">
    <Bookshelf v-if="!currentBook" @book:select="handleBookSelect" />
    <ReaderView v-else :book="currentBook" @close="handleCloseReader" />
  </div>
</template>

<style>
/* Global styles */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family:
    system-ui,
    -apple-system,
    sans-serif;
}

.app {
  height: 100vh;
  overflow: hidden;
}
</style>
