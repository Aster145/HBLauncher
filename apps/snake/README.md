# Snake / 贪吃蛇

给当前 HBLauncher 使用的 GPU 应用，中文界面。应用保存在 Windows 电脑的 `HBLauncher/apps/snake`；无需重新输入 NS2。

## 开始玩

1. 保持当前 HBLauncher 的电脑进程运行。退出当前应用回到菜单，选择 **Snake**，按 **A** 打开。菜单未显示时选择 **Refresh** 刷新。
2. 游戏内再按 **A** 开始。
3. **方向键 / 左摇杆**转向，**+ 或 X**暂停，**A / + / X**继续。
4. 撞墙或撞自己后，**A**重新开始；**B / −**返回 HBLauncher。

每吃一个果实加 10 分，蛇变长；每 30 分提速，最高 20 格/秒。手柄断开时自动暂停，重新连接后需按键继续。“本次最高”只保留到退出这个应用，不写存档。

保持 Switch 所在底座、网络连接不变，电脑端启动器保持运行。

## 修改与编译

在 `HBLauncher` 目录运行：

```powershell
node apps/snake/build.cjs
```

脚本自动使用本项目已经准备好的 Python、glslang 和 SPIR-V validator。中文字体默认使用 Windows 微软雅黑；其他平台可设置 `SNAKE_FONT` 指向支持中文的字体。

- `shaders/app.comp`：移动、输入、计分和碰撞规则。
- `shaders/game.glsl`：棋盘尺寸和游戏状态字段。
- `shaders/app.frag`：游戏画面与布局。
- `assets.py`：中文文字图集和图标。

先退出 Snake，再修改并编译；在 HBLauncher 菜单刷新后重新打开。当前布局固定 30×20，改变棋盘尺寸需要同步修改渲染布局。

电脑 GPU 规则验证（实际执行同一个 SPIR-V 文件）：

```powershell
node apps/snake/check.cjs
```

## 已验证（2026-10-24）

- 编译与 Vulkan 1.0 SPIR-V 校验通过；HBLauncher 应用目录识别与加载校验通过。
- 电脑 RTX 4080 SUPER 实际执行同一份交付 shader，20 项规则测试通过，共 295 次 dispatch；报告在 `../../runs/snake-check/result.json`。
- 四种画面使用实际 vertex/fragment shader 渲染并检查，中文显示正常。
- Switch 2 23.0.1 / SmileBASIC 4.4.9 实机已打开 Snake；采集画面确认得分、蛇身增长和游戏结束画面。
- 暂停、断连、满盘获胜等边界条件由电脑 GPU 测试覆盖，本次没有逐项在 Switch 手柄上复测。
