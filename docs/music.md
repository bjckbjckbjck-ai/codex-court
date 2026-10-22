# 音乐库与官方来源

2026-10-20 整理。1.2 首次启动默认载入仓库所有者提供的《逆转裁判 4》游戏录音，共 8 首，约 6.6 MiB；来源、文件和环节映射见 [音乐包说明](../assets/music/NOTICE.md)。已有曲库不覆盖，默认曲目删除后不自动恢复。其他版本通过本地文件导入，不从来源网页抓取音乐。播放器完全本地运行，不增加模型调用或 API Key。

| 版本 | 官方入口 | 类型 |
| --- | --- | --- |
| 逆转裁判 1 | [Phoenix Wright: Ace Attorney Original Soundtrack](https://store.steampowered.com/app/1335140/?l=english) | Capcom 在 Steam 发布的原声专辑 |
| 逆转裁判 2 | [Justice for All Original Soundtrack](https://store.steampowered.com/app/1335150/?l=english) | Capcom 在 Steam 发布的原声专辑 |
| 逆转裁判 3 | [Trials and Tribulations Original Soundtrack](https://store.steampowered.com/app/1335160/Phoenix_Wright_Ace_Attorney__Trials_and_Tribulations_Original_Soundtrack/) | Capcom 在 Steam 发布的原声专辑 |
| 逆转裁判 4 / 5 / 6 | [Apollo Justice: Ace Attorney Trilogy](https://store.steampowered.com/app/2187220/Apollo_Justice_Ace_Attorney_Trilogy/) | 官方游戏合集与音乐鉴赏信息；不是音频下载接口 |
| 逆转检事 1 / 2 | [Capcom 官方音乐集与改编曲说明](https://www.capcom-support.com/hc/en-us/articles/15694564174748-Ace-Attorney-Investigations-Collection-Frequently-Asked-Questions-All-Platforms) | 游戏内画廊音乐鉴赏；不是独立原声专辑 |
| 大逆转裁判 1 | [Adventures Grand Performance Recording](https://store.steampowered.com/app/1694060/The_Great_Ace_Attorney_Adventures_Grand_Performance_Recording/) | Capcom 在 Steam 发布的原声专辑 |
| 大逆转裁判 2 | [Resolve Grand Performance Recording](https://store.steampowered.com/app/1694080/The_Great_Ace_Attorney_2_Resolve_Grand_Performance_Recording/) | Capcom 在 Steam 发布的原声专辑 |

以上链接提供来源和版本整理，不代表客户端已下载曲目。版本可以自由扩展；导入到自定义版本名称后，会出现在“配乐版本”中。

## 自动配乐规则

| 事件 | 环节 |
| --- | --- |
| 打开会话 | 开庭，8 秒后进入询问 |
| 点选/划选证言、发送追问 | 询问 |
| 关键追问开启，或已配置快版时带证据追问 | 询问（快）；关闭关键追问可切回慢版 |
| 居中检视证据、打开导师 | 逻辑；退出后恢复底层庭审环节 |
| 选择出示证据、收录证据、发送验证 | 调查 |
| 发送普通陈述，等待模型回答 | 思考 |
| 非异议的回复完成 | 询问 |
| 发送异议 | 异议，8 秒后进入追求，直到下一个相关操作 |
| 暂停回复、回到首页 | 休庭 |
| 手动切换到胜诉 | 胜诉；不根据模型回答或手工复核标记自动播放 |

配乐设置按版本保存，跨版本混搭也可用。没有分配的环节保持静音。关闭自动切换后，手动选择的环节保持不变；已安排的自动过渡会取消。试听使用同一个播放器，不叠加第二首曲目；关闭设置或结束试听后恢复原来的背景音乐。

1.3 将询问拆为独立快慢曲位，保留旧询问分配作为慢版。当前默认包没有快询问文件，快版保持空位等待用户导入；不使用追求曲替代。逻辑默认引用 BGM04；旧用户仅在首次升级时复制原思考曲的分配，此后不会覆盖修改或恢复主动清空的曲位。证据/导师的临时配乐不会取消暂停，也不会覆盖关闭自动切换后的手动选择。

## 本地实现

- 音频由用户选择，复制到 `DATA_FILE + '.music'`；默认是 `.local/court.json.music`。元数据和偏好保存在其中的 `library.json`，原文件不移动。
- 文件名改为随机 ID，并检查音频文件头与大小。音频接口沿用本机认证和 Origin/Host 检查，不接受任意文件路径。
- 播放器只使用一个 HTML Audio 元素，支持循环、切换淡出/淡入与音量控制。编码兼容性以本机 Edge/Chrome 为准，无法解码时显示提示。
- 音频通过支持 Range 的本机接口读取，不打包进 JSON、模型提示或 Codex 会话。
- 所有演出字卡由本项目 CSS 实现，提示音为合成短音。没有加载原版角色配音。
