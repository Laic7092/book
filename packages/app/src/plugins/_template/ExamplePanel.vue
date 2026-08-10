<script setup lang="ts">
// 示例面板: 插件 UI 组件从插件目录懒加载, 禁用插件后由 defineAsyncComponent 卸载.
// 组件可以 import 插件私有模块 (如 ./engine), 但不得 import 其他插件目录.
defineEmits<{ close: [] }>();
</script>

<template>
  <div class="example-panel">
    <p>这是一个示例面板。复制 _template 目录开始写你的插件。</p>
  </div>
</template>
