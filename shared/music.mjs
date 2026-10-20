export const PHASES = [
  { id: 'opening', label: '开庭', en: 'COURT OPENS', hint: '进入会话，播放 8 秒后转入询问' },
  { id: 'questioning', label: '询问', en: 'CROSS-EXAMINATION', hint: '选中证言、追问与等待下一次陈述' },
  { id: 'objection', label: '异议', en: 'OBJECTION', hint: '发送异议时播放，8 秒后转入追求' },
  { id: 'pursuit', label: '追求', en: 'PURSUIT', hint: '异议之后，继续检验证据与矛盾' },
  { id: 'investigation', label: '调查', en: 'INVESTIGATION', hint: '收录证据、出示材料与要求验证' },
  { id: 'thinking', label: '思考', en: 'LOGIC', hint: '普通对话正在等待 Codex 回应' },
  { id: 'recess', label: '休庭', en: 'RECESS', hint: '返回首页或暂停当前回应' },
  { id: 'victory', label: '胜诉', en: 'VICTORY', hint: '由你手动播放，不自动判断胜负' },
];
export const VERSIONS = ['逆转裁判 1','逆转裁判 2','逆转裁判 3','逆转裁判 4','逆转裁判 5','逆转裁判 6','逆转检事 1','逆转检事 2','大逆转裁判 1','大逆转裁判 2','精选 / 自定义'];
export const MAX_AUDIO_BYTES = 64 * 1024 * 1024;
export const AUDIO_EXTENSIONS = /\.(mp3|ogg|wav|flac|m4a|aac|opus)$/i;
export const DEFAULT_MUSIC_SETTINGS = { enabled: false, volume: 0.35, auto: true, version: VERSIONS[0], bindings: [] };
export function inferPhase(name) {
  const tests = [
    ['pursuit', /pursuit|追求|追究|追及|追い[つ詰]|追いつめ|追詰/i],
    ['objection', /objection|異議|异议/i],
    ['victory', /victory|勝訴|胜诉|無罪|无罪/i],
    ['questioning', /cross.?examination|confrontation|尋問|询问|尋問|讯问|対決|对决|moderato|allegro|presto/i],
    ['recess', /lobby|休憩|休庭|待合/i],
    ['thinking', /logic|thinking|逻辑|邏輯|ロジック|思考|推理/i],
    ['investigation', /investigation|捜査|搜查|調査|调查/i],
    ['opening', /court.*session|court.*open|trial|開廷|开庭|開庭/i],
  ];
  return tests.find(([,pattern]) => pattern.test(name))?.[0] || '';
}
export function boundTrack(library, phase) {
  const binding = library.settings.bindings.find(b => b.version === library.settings.version && b.phase === phase);
  return library.tracks.find(t => t.id === binding?.trackId) || null;
}
