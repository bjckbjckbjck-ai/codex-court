# 设计与素材

名称：异议 · Codex Court / Local Edition 01。

以法庭视觉小说为参考，用深庭绿、羊皮纸色、黄铜色与朱红强调建立主次。左侧是卷宗，中间是场景和证言，右侧是可出示的证据。逐句选择要让“我正在质询哪一句”始终可见；结果由证据决定，不把争论包装成必然获胜的游戏。

原创法庭插画由 imagegen 工具生成，文件为 `public/assets/courtroom.png`。圆形天平印章是项目内的 SVG，提示音通过 Web Audio 合成。1.2 默认 BGM 为用户提供的游戏录音，见 [音乐包说明](../assets/music/NOTICE.md)；播放器不加载远程音频。

生成提示词：

> Create one wide horizontal panoramic illustration for a personal desktop app named Codex Court. Use case stylized-concept. Art only, absolutely no text, no letters, no UI, no logos. A cinematic Japanese courtroom visual novel scene in the spirit of Ace Attorney: at right a charismatic original young male advocate with swept dark hair, wearing a dark navy suit, ivory shirt, burgundy tie, half-body behind a polished wooden witness bench, determined intelligent expression, one hand holding a stack of case papers. Keep character entirely in rightmost 40% of image with generous air above his head. Left 60% is atmospheric mostly empty courtroom architecture to overlay text later: grand gold-toned neoclassical pillars, a round abstract sun emblem high above judge's seat, dark mahogany wood panels, midnight navy shadows, dusty light shafts, amber warmth. Clean ink contours, premium 2D hand-painted anime background, graphic cel shading on character, restrained deep navy, oxblood, parchment, antique brass palette. Deliberate negative space lower left, luxurious subtle aged-paper grain, dramatic but friendly. Very wide 2.5:1 composition landscape. Not a screenshot and no watermark. Save finished image for the current project.

交互图标使用 Lucide（ISC 许可，见依赖包许可证），界面使用系统字体，无外部字体请求。

通过 Sites 技能的本地开发流程组织 UI 和验收；这是连接本机进程的个人客户端，不发布到外网。响应式布局和动画遵循 reduced-motion 设置，音效默认关闭。
