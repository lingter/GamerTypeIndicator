import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Vite 配置：React + Tailwind v4。
// 引擎/数据在 src 下，按需被打包；后续托管平台直接用 vite build 产物。
//
// base: './' —— 产物内资源路径用相对路径，便于：
//   1) 直接双击 dist/index.html 打开（file:// 协议下也能加载 JS/CSS）；
//   2) 部署到任意子路径（如码云 Pages 的 /repo/ 子目录）无需改配置。
//   若部署到根域名且不需要双击打开，可删掉此行用默认 '/'。
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/GamerTypeIndicator/'
});

