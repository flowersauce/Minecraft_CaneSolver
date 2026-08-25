# Minecraft CaneSolver

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Vanilla JS](https://img.shields.io/badge/Vanilla-JavaScript-f7df1e.svg)](app.js)
[![GitHub Pages](https://img.shields.io/badge/在线体验-GitHub%20Pages-3c8527.svg)](https://flowersauce.github.io/Minecraft_CaneSolver/)

Minecraft 甘蔗最大化种植布局网页工具。支持矩形与圆形区域，自动计算水源位置，并以俯视方块图展示种植方案。项目使用原生 HTML、CSS 和 JavaScript，无需构建或安装依赖。

> 本项目并非 Minecraft 官方产品，也未经 Mojang Studios 或 Microsoft 认可。

## 在线体验

访问：<https://flowersauce.github.io/Minecraft_CaneSolver/>

## 本地运行

直接用浏览器打开 `index.html`，或启动静态文件服务器：

```bash
python -m http.server 8080
```

然后访问 `http://localhost:8080`。

## 功能

- 矩形区域：指定 X 轴宽度与 Z 轴长度，默认 8 × 8
- 圆形区域：指定 1–32 格直径，默认直径 16，圆心坐标为 X0 / Z0
- 默认使用 Minecraft 泥巴作为种植基底
- 方块图外侧显示带方向和刻度的 X / Z 坐标轴
- 参数输入作为独立左侧栏，与右侧预览区域保持间距
- 页面采用左侧参数、中间预览、右侧统计的三栏布局
- 中间区域不使用额外卡片背景，仅保留图例工具栏和固定预览框
- 导出 PNG 与“自适应放大”按钮位于图例同一行右侧
- 自适应缩放以方块图形本身为中心，仅在计算最大尺寸时为坐标轴预留空间
- 鼠标滚轮缩放以鼠标所指的方块图位置为锚点
- 预览滚动条会完全隐藏
- 统计数据作为独立卡片固定在页面右侧
- PNG 导出会以方块图为画布中心，并对称预留坐标轴空间
- 网页统一使用 Mojangles，中文及缺失字符回退到 GNU Unifont
- X/Z 原点标记使用相同的正方形背景，方向标签与对应轴数字对齐

## 圆形区域规则

圆形边界参考常见 Minecraft 圆生成器的方块中心点算法：将每个方块中心归一化后，保留位于单位圆内的方块。相比面积覆盖阈值算法，生成结果更饱满。奇数直径时，唯一的圆心方块为 X0 / Z0；偶数直径时，几何圆心位于四个方块之间，其中 +X / +Z 第一象限的方块定义为 X0 / Z0。

## 计算规则

每个区域内的非水源方块必须在水平四方向之一紧邻水源。水源集合因此构成区域网格图的支配集；最小化水源数量等价于最大化甘蔗种植数量。

## 项目结构

```text
.
├── index.html          # 页面结构
├── styles.css          # Minecraft 风格界面与方块样式
├── app.js              # 布局求解、渲染、缩放和 PNG 导出
└── assets/fonts/       # Mojangles 与 GNU Unifont 网页字体
```

## 开源协议

项目源代码采用 [MIT License](LICENSE)。

字体文件保留各自的原始授权：

- Mojangles 网页字体来自 `@south-paw/typeface-minecraft`，采用 MIT License。
- GNU Unifont 采用 GPL v2 或更高版本，并附带 GNU 字体嵌入例外。

完整字体来源及许可证见 [`assets/fonts/`](assets/fonts/)。
