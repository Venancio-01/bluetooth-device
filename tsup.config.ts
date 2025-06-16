import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'], // 入口文件
  format: ['esm'], // 输出格式：CommonJS 和 ESM
  dts: true, // 生成 .d.ts 类型声明文件
  splitting: false, // 是否代码分割
  sourcemap: true, // 是否生成 source map
  clean: true, // 打包前清空输出目录
})
