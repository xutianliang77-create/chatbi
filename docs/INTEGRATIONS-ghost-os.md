# Ghost OS Computer Use MCP 集成

Ghost OS 是一个 macOS 原生 Computer Use MCP server，可让 CodeClaw 通过 MCP 读取和操作本机桌面应用。它适合浏览器自动化、表单填写、桌面 App 操作、截图标注、可复用 recipe 和人工操作录制。

> 安全边界：Computer Use 会真实点击、输入、热键、拖拽和切换窗口。只在可信工作区、可信屏幕内容和明确用户意图下启用。

## 能力边界

CodeClaw 不内置 macOS Accessibility / ScreenCaptureKit / CGEvent 底层实现，而是把 Ghost OS 作为外部 MCP server 接入：

- CodeClaw 负责 provider、权限门、skill workflow、工具池、审计和上下文预算。
- Ghost OS 负责 macOS 桌面感知、截图、AX tree、点击、输入、拖拽、热键、recipes 和 learning。
- MCP bridge 会把 Ghost OS 工具注册为 `mcp__ghost-os__ghost_*`。

## 安装前提

- macOS 14 或更高版本。
- 已安装 Ghost OS，并确保 `ghost` 命令在 `PATH` 中。
- macOS 授权：
  - Accessibility，用于读取和操作 UI 元素。
  - Screen Recording，用于截图和视觉定位。
  - Input Monitoring，用于学习/录制用户操作。

可用 `codeclaw doctor` 查看 `ghost-os-mcp` 状态。

## MCP 配置

在 `~/.codeclaw/mcp.json` 或项目根目录 `.mcp.json` 中加入：

```json
{
  "servers": {
    "ghost-os": {
      "command": "ghost",
      "args": ["mcp"]
    }
  }
}
```

重启 CodeClaw 后查看：

```text
/mcp
/mcp tools ghost-os
```

## 推荐使用方式

Computer Use 不建议默认进入普通对话。需要时启用专用 skill：

```text
/skills use computer_use
```

或把工具集收敛到 computer profile：

```bash
CODECLAW_TOOLSET=computer node dist/cli.js
```

推荐流程：

1. 先用 `ghost_context` 或 `ghost_state` 理解当前桌面。
2. 优先查 recipes：`ghost_recipes`、`ghost_recipe_show`，有匹配流程再 `ghost_run`。
3. 行动前用 `ghost_find`、`ghost_inspect`、`ghost_read`、`ghost_annotate` 定位目标。
4. 点击/输入/热键/拖拽后，用 `ghost_wait` 或重新读取状态验证结果。
5. 对发送、删除、支付、审批、提交等不可逆动作，必须由用户在当前轮明确要求。

## 权限分级

CodeClaw 对 Ghost OS MCP 工具做了更细的风险分类：

| 类别 | 工具示例 | 风险 |
| --- | --- | --- |
| 读取上下文 | `ghost_context`, `ghost_state`, `ghost_find`, `ghost_read`, `ghost_inspect` | low |
| 屏幕/视觉 | `ghost_screenshot`, `ghost_annotate`, `ghost_ground`, `ghost_parse_screen` | medium |
| 真实操作 | `ghost_click`, `ghost_type`, `ghost_hotkey`, `ghost_drag`, `ghost_window` | high |
| recipe/learning 写入 | `ghost_run`, `ghost_recipe_save`, `ghost_learn_start` | high |

在 `auto` / `acceptEdits` 模式下，高风险工具会被阻止；在默认模式下会要求确认；`dontAsk` / `bypassPermissions` 只应在高度可信场景短时使用。

## 当前限制

- 目前集成是 macOS/Ghost OS MCP 适配，不是跨平台原生 Computer Use。
- MCP 多媒体结果不会直接塞入模型上下文；CodeClaw 会用简短占位描述图片/截图内容，避免 base64 刷爆上下文。
- 若需要让 Web UI 直接预览 Ghost OS 返回的截图，应进一步把 MCP image content 存为 artifact 并在 Web 侧渲染。

## 故障排查

- `/mcp` 没有 `ghost-os`：检查 `mcp.json` 路径、JSON 格式和 server 名称。
- `ghost-os` failed：检查 `ghost` 命令是否在 PATH，尝试终端运行 `ghost mcp`。
- 工具有但点击失败：检查 macOS Accessibility 权限和目标 App 是否允许辅助功能控制。
- 截图为空或报错：检查 Screen Recording 权限。
- learning 失败：检查 Input Monitoring 权限。
