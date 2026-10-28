# Windows 使用说明

这个分支提供 Windows 宿主适配，保留上游的 Pico 启动方式。Windows 入口默认使用 `--manual`：电脑显示本次连接命令，由你手动输入，或者通过已经配置好的 ESP32 键盘工具发送。双击启动器不会自动配置 ESP32，也不会自动把程序输入主机。

## 电脑环境

- Windows 10/11，Node.js 22 或更新版本。
- Python 3，安装 Pillow；使用自己的串口键盘工具时通常还需要 pyserial。
- SPIRV-Tools 的 `spirv-val.exe`；重新编译着色器还需要 glslang 的 `glslangValidator.exe`。
- 菜单需要可用的 TrueType 字体。入口优先使用本地 DejaVu Sans，否则使用 Windows Arial；可以用 `HB_FONT` 指定其他字体。

安装 Node.js、Python 时启用 PATH。打开新的 Windows 终端后检查：

```powershell
node --version
python --version
python -m pip install Pillow pyserial
spirv-val --version
glslangValidator --version
```

Node.js 可从 [官方网站](https://nodejs.org/) 安装，Python 可从 [官方网站](https://www.python.org/downloads/windows/) 安装。glslang 和 SPIRV-Tools 可使用 [MSYS2](https://www.msys2.org/) 的对应 Windows 包，并将工具的 `bin` 目录加入 PATH；工具依赖的 DLL 也应保留。

`tools/` 中的 Python 虚拟环境、字体和工具安装不随源码发布。`windows-env.cmd` 只在对应文件存在时使用本地工具，否则使用 PATH。已有的 `NODE`、`PYTHON`、`HB_FONT`、`GLSLANG`、`SPIRV_VAL` 环境变量会优先保留；这些值应是可执行文件或字体路径，不要附带命令行参数。

如果工具不在 PATH，可以在同一个 PowerShell 窗口里设置，例如：

```powershell
$env:PYTHON = 'C:\Tools\Python\python.exe'
$env:GLSLANG = 'C:\Tools\glslang\bin\glslangValidator.exe'
$env:SPIRV_VAL = 'C:\Tools\spirv-tools\bin\spirv-val.exe'
$env:HB_FONT = 'C:\Windows\Fonts\arial.ttf'
```

上面的路径是示例，请换成自己的安装路径。不要复制其他电脑的 Python 虚拟环境；应在新电脑重建。

## 先做电脑端检查

在项目根目录双击 `Check-Windows.cmd`，或者运行：

```powershell
.\Check-Windows.cmd --no-pause
```

检查包括依赖、启动器着色器、应用包和菜单图片生成，只读取本地文件并写入 `runs/host-check/`。它不会连接 Switch、ESP32 或 OBS，也不能证明主机端能启动。仓库保留启动器及 Hello World 的预编译资源；缺少生成资源时，按仓库 README 的构建说明补齐。NES 模拟器需要自行提供 ROM，源码仓库不包含游戏 ROM。

## 启动 HBLauncher

先按上游 [Getting Started](docs/GETTING_STARTED.md) 准备符合要求的 SmileBASIC 环境和已保存的 `NS2` 程序。Windows 入口不代替首次录入步骤。不要把 Pico 的 Python 文件当成 SmileBASIC 程序录入。

1. 让电脑与 Switch 位于可互通的局域网。在 Windows 运行 `ipconfig`，找到 Switch 能访问的电脑网卡 IPv4 地址。不要填 Switch 地址、VPN 虚拟网卡地址或公网地址。
2. 完整重启 Switch，打开 SmileBASIC，进入保存 `NS2` 的项目和 Direct 界面。
3. 双击 `Start-Windows.cmd`，输入电脑 IPv4 地址；也可以在项目根目录运行下列命令。
4. 电脑端检查通过后，按窗口显示的顺序操作。用实体键盘或自己的 ESP32 工具输入命令；加载确认框用手柄确认。使用本次窗口打印的完整连接命令。
5. 等待 HBLauncher 菜单出现。运行期间保持电脑启动窗口打开，电脑与主机不休眠，网络和底座状态保持稳定。

PowerShell 示例（将占位文字换成实际 IPv4 地址）：

```powershell
.\Start-Windows.cmd '电脑的局域网IPv4地址'
```

也可以设置 `$env:HB_PC_IP = '电脑的局域网IPv4地址'` 后运行 `.\Start-Windows.cmd`。选择优先级为命令行参数、`HB_PC_IP`、交互输入，没有固定地址默认值。

Windows 防火墙需要允许 Node.js 接收局域网 TCP 39380。此入口使用手动/外部键盘模式，不启动 Pico 键盘服务；上游 Pico 模式及其额外端口要求见原指南。

连接命令每次启动都会变化，不能复用旧会话。失败后按上游要求重启主机再开始新会话，不要在同一个 SmileBASIC 进程重复执行 `REMOVE`。

## 应用、退出与故障排查

- 应用存放在电脑 `apps/` 下。方向键选择，A 打开；返回键由应用定义。
- 更新应用时先返回菜单，完成替换或构建，再点击右上角 Refresh。Joy-Con 2 鼠标光标移到按钮后，可按 ZR 点击。
- `ftpd-sb` 是独立应用，需要按其 [项目说明](https://github.com/ravensclawx/ftpd-sb) 安装完整包。连接地址与端口以它的屏幕显示为准；它提供 SmileBASIC 已挂载目录，不是整个系统根目录。
- 结束时先退出应用，再在电脑窗口按 Ctrl+C，等待清理结束。
- 若提示 `Console response timed out`，旧画面仍可能留在屏幕上，但会话已不能继续。先固定网络和底座状态，再完整重启主机并重新启动宿主。
- `App unavailable` 的具体原因看 `runs/launcher-*/app-runtime.json`，不能仅凭这条提示判断为网络故障。

`runs/` 包含会话日志、连接信息和内存截图，已从 Git 排除。反馈问题时只提供相关错误片段，移除临时凭据与自己的地址。电脑端测试、着色器验证与 Switch 实测是不同检查，具体兼容性仍以实际设备结果为准。
