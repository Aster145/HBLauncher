# Files / 文件浏览器

为当前 Windows + SmileBASIC + HBLauncher 环境制作的只读文件浏览器。文件来自正在连接的 Switch；电脑负责读取接口和文字排版。

## 范围

`/` 是可访问目录的汇总入口：

- `/save`：SmileBASIC 存档。
- `/tmp`：SmileBASIC 临时文件。
- `/rom`：SmileBASIC 只读资源。

当前已有接口没有提供系统 NAND 根目录、其他游戏存档或 SD 卡访问。这些目录也不会因安装本应用而出现。浏览器不提供写入、删除或重命名操作。

## 操作

在 HBLauncher 选择 **Files**，按 A 打开。

| 按键 | 功能 |
| --- | --- |
| ↑ / ↓ 或左摇杆 | 选择条目 |
| A | 进入目录 / 预览文件 |
| B | 返回上级；文件预览中返回原目录 |
| L / R 或 ← / → | 上一页 / 下一页 |
| X | 重新读取当前页 |
| Y | 文件预览中切换自动文本与十六进制 |
| − | 退出到 HBLauncher |

目录每页 12 项，文件夹排在前面；显示文件大小。文件预览每页 512 字节，可继续翻页；有效 UTF-8 内容自动按文本显示，其他内容显示十六进制。二进制格式的 BASIC 保存文件不保证能直接显示源码。文本换行太多时可按 Y 查看完整字节。

长名称在列表中省略显示，导航使用完整 UTF-8 名称。继承现有接口限制：路径最多 740 UTF-8 字节，单目录最多 4096 项。读取失败会显示错误，可按 X 重试或 B 返回。

首次安装需要重新启动电脑端 HBLauncher 并建立新的主机会话，因为增加了 `files-read` 接口。以后仅修改本应用的画面时，退出应用、编译、刷新菜单即可。

## 修改与验证

从 HBLauncher 目录执行：

```powershell
node apps/file-browser/build.cjs
node apps/file-browser/check.cjs
node --test sdk/tests/file-browser.test.cjs sdk/tests/browser-runtime.test.cjs
```

- `shaders/app.comp`：手柄操作和读取请求。
- `shaders/app.frag`：文件列表、选中行和预览界面。
- `sdk/host/file-browser.cjs`：复用现有主机文件读取接口。
- `sdk/host/file-browser-render.py`：动态文件名与内容排版。
- `protocol.json`：前后端共享数据约定。

电脑测试、桌面 GPU 渲染和 Switch 实机验证分别记录，不相互替代。

## 验证记录（2026-10-24）

- 编译、Vulkan 1.0 SPIR-V 和 HBLauncher 应用加载检查通过。
- SDK、FTP 与新读取接口的 46 项电脑测试通过。
- 26 项导航测试在电脑 GPU 上实际执行交付的计算着色器，共 556 次 dispatch。
- 根入口、目录列表、中文文本、十六进制和错误页均使用实际着色器生成桌面预览。
- Switch 2 实机已打开 Files，采集画面确认中文界面和根入口显示；用户实际操作后确认读取成功。详细目录和文件预览的实机成功依据为用户反馈，桌面样例预览不当作主机内容。

系统目录扩展：本次审查没有找到可用的系统分区挂载实现或本机成功权限记录。上游记录 SD 文件系统权限被拒绝；没有把这个上游记录写成本机新测得的结果。当前 `/` 是三个现有挂载点的汇总，修改上级按钮不能增加系统存储权限。
