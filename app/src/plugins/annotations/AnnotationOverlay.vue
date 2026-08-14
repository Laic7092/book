<script setup lang="ts">
import { useAnnotationUI } from "./useAnnotationUI";
import SelectionToolbar from "./SelectionToolbar.vue";
import AnnotationPopover from "./AnnotationPopover.vue";

const {
  showToolbar,
  toolbarPos,
  showNoteInput,
  showPopover,
  popoverAnnotation,
  popoverPosition,
  handleHighlight,
  handleUnderline,
  handleAddNote,
  handleSaveNote,
  handleCancelNote,
  handleUpdateNote,
  handleUpdateColor,
  handleDeleteAnnotation,
} = useAnnotationUI();
</script>

<template>
  <SelectionToolbar
    :visible="showToolbar"
    :position="toolbarPos"
    :show-note-input="showNoteInput"
    @highlight="handleHighlight"
    @underline="handleUnderline"
    @add-note="handleAddNote"
    @save-note="handleSaveNote"
    @cancel-note="handleCancelNote"
  />
  <AnnotationPopover
    :visible="showPopover"
    :annotation="popoverAnnotation"
    :position="popoverPosition"
    @update-note="handleUpdateNote"
    @update-color="handleUpdateColor"
    @delete="handleDeleteAnnotation"
    @close="showPopover = false"
  />
</template>
