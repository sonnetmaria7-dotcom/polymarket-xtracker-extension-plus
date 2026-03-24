# Polymarket XTracker Pace Overlay Plus

这是基于旧版 `polymarket-xtracker-extension` 分出来的增强版，不覆盖原插件。

当前版本：**0.2.6**

## 设计原则

- **保持旧版展示方式**：直接贴在每个区间 outcome 上显示
- **不额外弹独立窗口**
- **不破坏 Polymarket 原页面布局**

## 新增内容

- 每个区间直接显示：
  - **所需时速**（条/小时）
  - **所需日均**（条/天）
  - **按当前观测均速估算的触达时间**
- 顶部仍保留一块轻量 summary，显示：
  - 当前总发帖数
  - 剩余时间
  - 当前观测均速

## 0.2.6 更新说明

- 去掉重复展示的小时速率文案：不再同时显示 `/小时` 和 `/h`
- 当前 badge 统一保留中文主口径：
  - 距下限还差多少条
  - 距上限还有多少条
  - 需多少条/小时
  - 需多少条/天
  - 下限约多久

## 0.2.5 更新说明

- 优化区间 badge 排版：默认改为 **块级展示**，不再强制单行省略
- 放宽 badge 最大宽度，长文案可自动换行，避免被截断看不全
- 适配你这种 `距下限还差... / 需 xx~yy/小时` 的长提示场景

## 0.2.4 更新说明

- 保留原来的 **时速 / 日均 / 预计触达时间** 展示
- 对未进入区间的 outcome，新增更直观文案：
  - **距下限还差多少条**
  - **距上限还有多少条**
  - **所需每小时速率**
- 例如会显示：`距下限还差 13 条，距上限还有 32 条，需 7.63~18.78/小时`

## 0.2.3 更新说明

- 新增 **4h / 12h / 24h 滚动均速** 展示
- 直接使用 XTracker API 返回的 `stats.daily` 小时分桶计算，不依赖本地缓存
- 滚动窗口按小时桶重叠比例加权，边界更严谨
- 区间 badge 判断优先采用短窗口滚动速率（4h → 12h → 24h → 全程）

## 0.2.2 更新说明

- 移除 v0.2.1 的独立浮动面板
- 改回和旧版一致的 **区间内联 badge 样式**
- 每个区间直接显示更完整的节奏信息
- 避免额外窗口遮挡页面

## 安装（Mac Chrome）

1. 打开 `chrome://extensions`
2. 开启 **Developer mode / 开发者模式**
3. 点击 **Load unpacked / 加载已解压的扩展程序**
4. 选择目录：
   `/Users/ydybot/.openclaw/workspace/polymarket-xtracker-extension-v2`
5. 如果已经加载过旧的 v2，点一下 **刷新 / Reload** 扩展

## 数据源

- `https://xtracker.polymarket.com/api/users`
- `https://xtracker.polymarket.com/api/trackings/:id?includeStats=true`
