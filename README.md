# Polymarket XTracker Pace Overlay Plus

这是基于旧版 `polymarket-xtracker-extension` 分出来的增强版，不覆盖原插件。

当前版本：**0.2.1**

## 新增内容

- 每个区间显示 **所需时速**（条/小时）
- 每个区间显示 **所需日均**（条/天）
- 显示 **当前观测均速**
- 显示按当前观测均速推算的：
  - 预计触达区间下限时间
  - 预计触达区间上限时间
- 在 outcome 标签旁直接给出简短状态提示

## 0.2.1 更新说明

- 修复：不再把增强面板插进页面主布局，避免把 Polymarket 原页面挤坏
- 改为：**左下角浮动面板** + 独立滚动，不影响原站内容区宽度
- 新增：面板右上角关闭按钮，可对当前市场临时隐藏
- 保留：各 outcome 上的区间速度 badge

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
